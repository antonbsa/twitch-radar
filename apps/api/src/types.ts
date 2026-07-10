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

// Web Push payload contract shared with the service worker
// (apps/web/public/service-worker.js, architecture spec).
export interface NotificationPayload {
  title: string
  body: string
  url: string
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
