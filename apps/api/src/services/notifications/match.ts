import type { Database } from "../../db"
import type { ChannelStateChangeRecord } from "../../db/repositories/channel-state-changes"
import type { ChannelStateRecord } from "../../db/repositories/channel-state"
import type { NotificationTriggerType } from "../../db/repositories/notification-deliveries"
import type {
  Language,
  NotificationJobMessage,
  NotificationPayload,
} from "../../types"

// ADR 0008: only these transitions notify. stream_ended never does, and
// "entered/left desired category" is derived per user right here.
const TRIGGER_BY_CHANGE_TYPE: Partial<Record<string, NotificationTriggerType>> =
  {
    stream_started: "stream_started_in_category",
    category_changed: "switched_into_category",
  }

// A title in the same shape the client renders ("{broadcaster} is
// streaming {category}") tells the reader nothing a body would add; the
// backend can't compare against the actual localized string (ADR 0044 keeps
// translation client-side), so this is a best-effort heuristic rather than
// an exact match.
function isRedundantWithCategory(
  title: string | null,
  categoryName: string,
): boolean {
  return (
    !title || title.trim().toLowerCase() === categoryName.trim().toLowerCase()
  )
}

function computeUptime(
  startedAt: string | null,
  now: Date,
): { hours: number; minutes: number } | null {
  if (!startedAt) return null
  const elapsedMs = now.getTime() - Date.parse(startedAt)
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null
  const totalMinutes = Math.floor(elapsedMs / 60000)
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

// Body precedence per issue #38 item 4 (and the title/body redundancy fix):
// stream_started_in_category shows the current stream title when it exists
// and isn't just a restatement of the title's own category name; otherwise
// the notification is title-only. switched_into_category prefers uptime +
// the category just left, degrading through uptime-only, previous-category-
// only, then the stream title, down to title-only.
// Exported for tests/api/notification-body.test.ts: the push payload it
// feeds is encrypted end-to-end (ADR 0035), so the body-composition
// precedence can't be observed through an HTTP round trip the way other
// tests/api coverage works — this pure function is tested directly instead.
export function buildBody(
  trigger: NotificationTriggerType,
  categoryName: string,
  previousCategoryName: string | null,
  channelState: ChannelStateRecord | null,
  now: Date,
): { bodyKey: string; params: Record<string, string> } | null {
  const title = channelState?.title ?? null

  if (trigger === "stream_started_in_category") {
    if (title && !isRedundantWithCategory(title, categoryName)) {
      return {
        bodyKey: "notification.stream_started_in_category.body.stream_title",
        params: { streamTitle: title },
      }
    }
    return null
  }

  const uptime = computeUptime(channelState?.started_at ?? null, now)
  if (uptime && previousCategoryName) {
    return {
      bodyKey: "notification.switched_into_category.body.uptime_and_previous",
      params: {
        hours: String(uptime.hours),
        minutes: String(uptime.minutes),
        previousCategory: previousCategoryName,
      },
    }
  }
  if (uptime) {
    return {
      bodyKey: "notification.switched_into_category.body.uptime_only",
      params: { hours: String(uptime.hours), minutes: String(uptime.minutes) },
    }
  }
  if (previousCategoryName) {
    return {
      bodyKey: "notification.switched_into_category.body.previous_only",
      params: { previousCategory: previousCategoryName },
    }
  }
  if (title && !isRedundantWithCategory(title, categoryName)) {
    return {
      bodyKey: "notification.switched_into_category.body.stream_title",
      params: { streamTitle: title },
    }
  }
  return null
}

// ADR 0044: payloads carry only i18n keys, params, and the recipient's
// language; broadcaster/category IDs ride along so snoozing can schedule a
// reminder without referencing a specific delivery (ADR 0048).
function buildPayload(
  trigger: NotificationTriggerType,
  broadcasterName: string,
  categoryName: string,
  lang: Language,
  broadcasterUserId: string,
  categoryId: string,
  previousCategoryName: string | null,
  channelState: ChannelStateRecord | null,
  broadcasterLogin: string | null,
): NotificationPayload {
  const body = buildBody(
    trigger,
    categoryName,
    previousCategoryName,
    channelState,
    new Date(),
  )
  return {
    titleKey: `notification.${trigger}.title`,
    ...(body ? { bodyKey: body.bodyKey } : {}),
    params: { broadcasterName, categoryName, ...(body?.params ?? {}) },
    lang,
    url: `/channels?broadcaster=${broadcasterUserId}`,
    broadcasterUserId,
    categoryId,
    ...(broadcasterLogin ? { broadcasterLogin } : {}),
    ...(channelState?.thumbnail_url
      ? { image: channelState.thumbnail_url }
      : {}),
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

  const channelState =
    await db.channelState.findByBroadcasterUserId(broadcasterUserId)
  // ADR 0050: suppress non-live stream types (rerun/playlist/watch_party) —
  // null covers rows written before this column existed, treated as live so
  // pre-migration channels don't go silently unnotified.
  if (channelState?.stream_type && channelState.stream_type !== "live") return

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
  // Fallback to the raw id rather than English prose (ADR 0044): these
  // values flow into `params` verbatim into every language's template, so a
  // fake-English fallback here would leak untranslated text.
  const broadcasterName =
    monitored?.broadcaster_display_name ??
    monitored?.broadcaster_login ??
    broadcasterUserId
  const categoryName = change.next_category_name ?? categoryId

  // Payload can no longer be built once and reused for every matched user —
  // `lang` is per-recipient — so language is batch-loaded up front instead.
  const languageByUserId = await db.users.findLanguagesByIds(
    Array.from(matchedUserIds),
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
      const payload = buildPayload(
        trigger,
        broadcasterName,
        categoryName,
        languageByUserId.get(userId) ?? "en",
        broadcasterUserId,
        categoryId,
        change.previous_category_name,
        channelState,
        monitored?.broadcaster_login ?? null,
      )
      await queue.send({ deliveryId: delivery.id, userId, payload })
    }
  }
}
