import type { Database } from "../../db"
import type { ChannelStateChangeRecord } from "../../db/repositories/channel-state-changes"
import type { NotificationTriggerType } from "../../db/repositories/notification-deliveries"
import type { NotificationJobMessage, NotificationPayload } from "../../types"

// ADR 0008: only these transitions notify. stream_ended never does, and
// "entered/left desired category" is derived per user right here.
const TRIGGER_BY_CHANGE_TYPE: Partial<Record<string, NotificationTriggerType>> =
  {
    stream_started: "stream_started_in_category",
    category_changed: "switched_into_category",
  }

function buildPayload(
  trigger: NotificationTriggerType,
  broadcasterName: string,
  categoryName: string,
): NotificationPayload {
  if (trigger === "stream_started_in_category") {
    return {
      title: `${broadcasterName} is streaming ${categoryName}`,
      body: `${broadcasterName} just started streaming a category you follow.`,
      url: "/channels",
    }
  }
  return {
    title: `${broadcasterName} switched to ${categoryName}`,
    body: `${broadcasterName} is now streaming a category you follow.`,
    url: "/channels",
  }
}

/**
 * Matches one channel_state_changes row against user preferences and stages
 * deliveries (ADRs 0007, 0008, 0034):
 *
 * - per-channel: active channel_category_preferences on this broadcaster and
 *   the transition's next category.
 * - global: active global_category_preferences on the next category, limited
 *   to users who follow this broadcaster (ADR 0007).
 * - a user matched by both gets one delivery — the dedupe key is per
 *   user/broadcaster/category/trigger/stream, not per preference.
 *
 * Every matched user gets a `pending` notification_deliveries row (the
 * unique dedupe index absorbs replays) and a send job. Jobs are enqueued for
 * any delivery still `pending`, so a replay after a crash between insert and
 * enqueue re-issues the job; the sender's status check keeps a double
 * enqueue from double-sending.
 */
export async function matchAndCreateDeliveries(
  db: Database,
  queue: Queue<NotificationJobMessage>,
  change: ChannelStateChangeRecord,
): Promise<void> {
  const trigger = TRIGGER_BY_CHANGE_TYPE[change.change_type]
  const categoryId = change.next_category_id
  if (!trigger || !categoryId) return

  const broadcasterUserId = change.broadcaster_user_id

  const channelPreferences =
    await db.channelCategoryPreferences.findActiveByBroadcasterAndCategory(
      broadcasterUserId,
      categoryId,
    )
  const matchedUserIds = new Set(channelPreferences.map((p) => p.user_id))

  const globalPreferences =
    await db.globalCategoryPreferences.findActiveByCategoryId(categoryId)
  if (globalPreferences.length > 0) {
    const followerUserIds = new Set(
      await db.followedChannels.findUserIdsByBroadcasterUserId(
        broadcasterUserId,
      ),
    )
    for (const preference of globalPreferences) {
      if (followerUserIds.has(preference.user_id)) {
        matchedUserIds.add(preference.user_id)
      }
    }
  }
  if (matchedUserIds.size === 0) return

  const [monitored] = await db.monitoredChannels.findByBroadcasterUserIds([
    broadcasterUserId,
  ])
  const broadcasterName =
    monitored?.broadcaster_display_name ??
    monitored?.broadcaster_login ??
    "A channel you follow"
  const payload = buildPayload(
    trigger,
    broadcasterName,
    change.next_category_name ?? "a category you follow",
  )

  const now = new Date().toISOString()
  for (const userId of matchedUserIds) {
    const delivery = await db.notificationDeliveries.insertPendingIfNew({
      userId,
      broadcasterUserId,
      categoryId,
      triggerType: trigger,
      eventsubMessageId: change.eventsub_message_id,
      streamId: change.stream_id,
      now,
    })
    if (delivery?.status === "pending") {
      await queue.send({ deliveryId: delivery.id, userId, payload })
    }
  }
}
