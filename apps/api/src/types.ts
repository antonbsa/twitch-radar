// Wire shapes of the EventSub `event` objects this app subscribes to
// (https://dev.twitch.tv/docs/eventsub/eventsub-reference/#events).
export interface StreamOnlineEventPayload {
  id: string
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
  type: string
  started_at: string
}

export interface StreamOfflineEventPayload {
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
}

export interface ChannelUpdateEventPayload {
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
  title: string
  language: string
  // Empty string when the channel has no category set.
  category_id: string
  category_name: string
  content_classification_labels: string[]
}

// Queue payload contract for TWITCH_EVENTS_QUEUE (ADR 0032). `messageId` is
// the idempotency key; `messageTimestamp` is Twitch's message timestamp used
// for stale-event ordering (ADR 0033).
interface TwitchEventQueueMessageBase {
  messageId: string
  messageTimestamp: string
  receivedAt: string
}

export type TwitchEventQueueMessage = TwitchEventQueueMessageBase &
  (
    | { eventType: "stream.online"; event: StreamOnlineEventPayload }
    | { eventType: "stream.offline"; event: StreamOfflineEventPayload }
    | { eventType: "channel.update"; event: ChannelUpdateEventPayload }
  )

// Language preference values (ADR 0044): stored on users.language, validated
// at the API layer via zod, mirrored on the web side (apps/web/src/types/user.ts).
export const SUPPORTED_LANGUAGES = ["en", "pt-BR", "es"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

// Shared web-push payload contract. The service worker resolves the title/body
// keys using the recipient locale and includes broadcaster/category identifiers
// so a notification click can schedule a reminder without referencing a delivery.
export interface NotificationPayload {
  titleKey: string
  // Optional so a title-only notification (no informative body to show) is
  // representable — the service worker must not fall back to generic body
  // text when this is absent (see item 4/redundancy fix, issue #38).
  bodyKey?: string
  params: Record<string, string>
  lang: Language
  url: string
  broadcasterUserId: string
  categoryId: string
  // Twitch login for the service worker's "Watch" action, which opens
  // twitch.tv/{login} directly rather than the app's own deep link. Absent
  // when the login isn't on hand (e.g. monitored_channels row not backfilled
  // yet) — the action is omitted rather than linking a broken URL.
  broadcasterLogin?: string
  // Stream thumbnail shown as the notification's `image`; omitted entirely
  // when there is none rather than sent as null (issue #38 item 6).
  image?: string
}

// Queue payload contract for NOTIFICATION_JOBS_QUEUE (ADR 0034). The payload
// is computed at match time (the matcher holds the change row and broadcaster
// names); the delivery row referenced by `deliveryId` is the dedupe/audit
// record and its `pending` status gates the actual send.
export interface NotificationJobMessage {
  deliveryId: string
  userId: string
  payload: NotificationPayload
}

export interface User {
  id: string
  twitch_user_id: string
  twitch_login: string
  twitch_display_name: string
  created_at: string
  updated_at: string
  last_follow_sync_at: string | null
  language: Language
}

export interface PushSubscriptionRecord {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}
