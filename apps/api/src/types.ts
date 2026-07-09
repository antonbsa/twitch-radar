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

export interface NotificationJobMessage {
  deliveryId: string
  userId: string
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
