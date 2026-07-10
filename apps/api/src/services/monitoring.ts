import type { AppConfig } from "../env"
import type { Database } from "../db"
import type { MonitorReason } from "../db/repositories/monitored-channels"
import { getStreamsByUserIds } from "./twitch/client"
import { getValidAccessToken } from "./twitch/token-refresh"

// Must match the webhook route T-007 registers under /api.
const EVENTSUB_CALLBACK_PATH = "/api/webhooks/twitch/eventsub"

/**
 * The callback URL this deployment stamps on its EventSub subscriptions —
 * also reconciliation's ownership marker (ADR 0036): only Twitch-side
 * subscriptions pointing here are ours to delete.
 */
export function eventsubCallbackUrl(config: AppConfig): string {
  return `${config.apiUrl}${EVENTSUB_CALLBACK_PATH}`
}

export interface MonitorTarget {
  broadcasterUserId: string
  broadcasterLogin?: string | null
  broadcasterDisplayName?: string | null
}

/**
 * Makes the given broadcasters monitored (ADR 0007): upserts
 * `monitored_channels` (re-enabling disabled rows), ensures pending local
 * EventSub subscription rows for T-007 to create on Twitch, and seeds
 * `channel_state` for broadcasters that have no row yet so future
 * transition comparisons have a baseline (ADR 0008). Broadcasters that
 * already have a state row are not re-fetched — EventSub-driven updates
 * are the source of truth once a row exists.
 */
export async function ensureMonitoredBroadcasters(
  db: Database,
  config: AppConfig,
  userId: string,
  targets: MonitorTarget[],
  reason: MonitorReason,
): Promise<void> {
  if (targets.length === 0) return
  const now = new Date().toISOString()

  await db.monitoredChannels.upsertAll(
    targets.map((target) => ({
      broadcasterUserId: target.broadcasterUserId,
      broadcasterLogin: target.broadcasterLogin ?? null,
      broadcasterDisplayName: target.broadcasterDisplayName ?? null,
      monitorReason: reason,
      now,
    })),
  )

  const callbackUrl = eventsubCallbackUrl(config)
  for (const target of targets) {
    await db.eventsubSubscriptions.ensurePending(
      target.broadcasterUserId,
      callbackUrl,
      now,
    )
  }

  await seedMissingChannelState(
    db,
    config,
    userId,
    targets.map((target) => target.broadcasterUserId),
  )
}

async function seedMissingChannelState(
  db: Database,
  config: AppConfig,
  userId: string,
  broadcasterUserIds: string[],
): Promise<void> {
  const existing =
    await db.channelState.findByBroadcasterUserIds(broadcasterUserIds)
  const seeded = new Set(existing.map((state) => state.broadcaster_user_id))
  const missing = broadcasterUserIds.filter((id) => !seeded.has(id))
  if (missing.length === 0) return

  const accessToken = await getValidAccessToken(db, config, userId)
  const streams = await getStreamsByUserIds(
    config.twitchClientId,
    accessToken,
    missing,
    config.twitchApiBaseUrl,
  )
  const streamByBroadcasterId = new Map(streams.map((s) => [s.user_id, s]))

  const now = new Date().toISOString()
  await db.channelState.upsertAll(
    missing.map((broadcasterUserId) => {
      const stream = streamByBroadcasterId.get(broadcasterUserId)
      return stream
        ? {
            broadcasterUserId,
            isLive: true,
            streamId: stream.id,
            categoryId: stream.game_id || null,
            categoryName: stream.game_name || null,
            title: stream.title || null,
            viewerCount: stream.viewer_count,
            startedAt: stream.started_at,
            now,
          }
        : {
            broadcasterUserId,
            isLive: false,
            streamId: null,
            categoryId: null,
            categoryName: null,
            title: null,
            viewerCount: null,
            startedAt: null,
            now,
          }
    }),
  )
}

/**
 * Soft-disables monitoring for each broadcaster no active preference still
 * requires: no active channel preference (any user) references it and no
 * user with an active global preference follows it. Disabled rows are the
 * signal for T-007's reconciliation to drop the Twitch-side subscriptions.
 */
export async function cleanupMonitoringForBroadcasters(
  db: Database,
  broadcasterUserIds: string[],
): Promise<void> {
  const now = new Date().toISOString()

  for (const broadcasterUserId of broadcasterUserIds) {
    const requiredByChannelPref =
      await db.channelCategoryPreferences.anyActiveForBroadcaster(
        broadcasterUserId,
      )
    if (requiredByChannelPref) continue

    const followerUserIds =
      await db.followedChannels.findUserIdsByBroadcasterUserId(
        broadcasterUserId,
      )
    const requiredByGlobalPref =
      await db.globalCategoryPreferences.anyActiveForUsers(followerUserIds)
    if (requiredByGlobalPref) continue

    await db.monitoredChannels.disable(broadcasterUserId, now)
  }
}
