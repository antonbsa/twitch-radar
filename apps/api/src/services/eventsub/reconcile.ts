import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { MONITORED_EVENT_TYPES } from "../../db/repositories/eventsub-subscriptions"
import { eventsubCallbackUrl } from "../monitoring"
import { getAppAccessToken } from "../twitch/app-token"
import {
  deleteEventsubSubscription,
  getAllEventsubSubscriptions,
} from "../twitch/client"

// Keeps one run well under the Workers subrequest limit even when a large
// broadcaster set gets disabled at once; the next run continues the cleanup.
const MAX_REMOTE_DELETES_PER_RUN = 20

// Twitch statuses that need no repair. Everything else (revocation reasons,
// failure states) means the subscription no longer delivers events.
const HEALTHY_REMOTE_STATUSES = new Set([
  "enabled",
  "webhook_callback_verification_pending",
])

/**
 * Compares local `eventsub_subscriptions` against Twitch and repairs both
 * sides (ADRs 0007, 0031, 0036):
 *
 * - broadcaster no longer monitored → delete the Twitch subscription and the
 *   local row (this is also what clears pending rows staged for a
 *   broadcaster that was disabled before the creation job picked them up).
 * - local row's Twitch subscription is missing or unhealthy → reset the row
 *   to `pending` so the minutely creation job recreates it.
 * - local and Twitch disagree on status (e.g. a missed challenge flip) →
 *   mirror Twitch's status locally.
 * - Twitch subscription with no local row → delete it (it spends quota and
 *   nothing consumes its events).
 * - monitored broadcaster missing local rows → stage them as `pending`.
 *
 * Only Twitch subscriptions whose webhook callback is this deployment's own
 * URL are touched — several environments share one Twitch application, and
 * their subscriptions are indistinguishable except by callback.
 */
export async function reconcileEventsubSubscriptions(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  const appAccessToken = await getAppAccessToken(kv, config)
  const callbackUrl = eventsubCallbackUrl(config)

  const [remote, local, monitored] = await Promise.all([
    getAllEventsubSubscriptions(
      config.twitchClientId,
      appAccessToken,
      config.twitchApiBaseUrl,
    ),
    db.eventsubSubscriptions.listAll(),
    db.monitoredChannels.listAll(),
  ])

  const ownedRemote = remote.filter(
    (sub) =>
      sub.transport.method === "webhook" &&
      sub.transport.callback === callbackUrl,
  )
  const remoteById = new Map(ownedRemote.map((sub) => [sub.id, sub]))
  const activeBroadcasterIds = new Set(
    monitored
      .filter((channel) => channel.disabled_at === null)
      .map((channel) => channel.broadcaster_user_id),
  )

  const now = new Date().toISOString()
  let remoteDeletes = 0
  // Budgeted best-effort delete: false means "try again next run".
  const deleteRemote = async (twitchSubscriptionId: string) => {
    if (remoteDeletes >= MAX_REMOTE_DELETES_PER_RUN) return false
    remoteDeletes += 1
    try {
      await deleteEventsubSubscription(
        config.twitchClientId,
        appAccessToken,
        twitchSubscriptionId,
        config.twitchApiBaseUrl,
      )
      return true
    } catch (error) {
      console.error("EventSub subscription delete failed", {
        twitchSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  const claimedTwitchIds = new Set<string>()
  for (const row of local) {
    const remoteSub = row.twitch_subscription_id
      ? remoteById.get(row.twitch_subscription_id)
      : undefined
    if (remoteSub) claimedTwitchIds.add(remoteSub.id)

    if (!activeBroadcasterIds.has(row.broadcaster_user_id)) {
      // Keep the row when the remote delete didn't go through so the pair is
      // retried next run instead of leaking the Twitch-side subscription.
      if (remoteSub && !(await deleteRemote(remoteSub.id))) continue
      await db.eventsubSubscriptions.deleteById(row.id)
      continue
    }

    if (row.status === "pending") continue

    if (!remoteSub) {
      await db.eventsubSubscriptions.resetToPending(row.id, now)
      continue
    }
    if (!HEALTHY_REMOTE_STATUSES.has(remoteSub.status)) {
      await deleteRemote(remoteSub.id)
      await db.eventsubSubscriptions.resetToPending(row.id, now)
      continue
    }
    if (row.status !== remoteSub.status) {
      await db.eventsubSubscriptions.markCreated(
        row.id,
        remoteSub.id,
        remoteSub.status,
        now,
      )
    }
  }

  for (const sub of ownedRemote) {
    if (!claimedTwitchIds.has(sub.id)) await deleteRemote(sub.id)
  }

  const eventTypesByBroadcaster = new Map<string, Set<string>>()
  for (const row of local) {
    const types =
      eventTypesByBroadcaster.get(row.broadcaster_user_id) ?? new Set()
    types.add(row.event_type)
    eventTypesByBroadcaster.set(row.broadcaster_user_id, types)
  }
  const broadcastersMissingSubscriptions: string[] = []
  for (const broadcasterUserId of activeBroadcasterIds) {
    const types = eventTypesByBroadcaster.get(broadcasterUserId)
    if (!types || MONITORED_EVENT_TYPES.some((type) => !types.has(type))) {
      broadcastersMissingSubscriptions.push(broadcasterUserId)
    }
  }
  await db.eventsubSubscriptions.ensurePending(
    broadcastersMissingSubscriptions,
    callbackUrl,
    now,
  )
}
