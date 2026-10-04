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

/**
 * Best-effort check: client titles are localized and can just repeat the
 * category name, so we only suppress a stream title when it matches the
 * category text.
 */
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

/**
 * Body precedence by trigger: stream_started_in_category prefers a
 * non-redundant stream title; switched_into_category prefers uptime +
 * previous category, then uptime, previous category, then the stream title.
 * Kept pure for direct tests; the push payload is encrypted end-to-end.
 *
 * @returns `null` means no body line, so the notification shows the title only.
 */
export function buildBody(
  trigger: NotificationTriggerType,
  categoryName: string,
  previousCategoryName: string | null,
  channelState: ChannelStateRecord | null,
  now: Date,
): { bodyKey: string; params: Record<string, string> } | null {
  const title = channelState?.title ?? null
  const hasNonRedundantTitle =
    title && !isRedundantWithCategory(title, categoryName)

  if (trigger === "stream_started_in_category") {
    if (hasNonRedundantTitle) {
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
  if (hasNonRedundantTitle) {
    return {
      bodyKey: "notification.switched_into_category.body.stream_title",
      params: { streamTitle: title },
    }
  }
  return null
}

/** Payloads use i18n keys and recipient language; IDs support snooze reminders. */
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
  broadcasterAvatarUrl: string | null,
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
    ...(broadcasterAvatarUrl ? { icon: broadcasterAvatarUrl } : {}),
  }
}

/**
 * Match the change against active category preferences, dedupe by user,
 * broadcaster, category, trigger, and stream, then enqueue one pending
 * delivery per matched user.
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
  // ADR 0050: suppress known non-live stream types; null means the type is
  // unknown (e.g. a channel.update with no prior stream.online), treated as live.
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

  const [[monitored], broadcasterAvatarUrl] = await Promise.all([
    db.monitoredChannels.findByBroadcasterUserIds([broadcasterUserId]),
    db.followedChannels.findProfileImageUrl(broadcasterUserId),
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
    if (delivery.status === "pending") {
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
        broadcasterAvatarUrl,
      )
      await queue.send({ deliveryId: delivery.id, userId, payload })
    }
  }
}
