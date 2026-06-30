export interface TwitchEventQueueMessage {
  messageId: string
  eventType: "stream.online" | "stream.offline" | "channel.update"
  receivedAt: string
  payload: unknown
}

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
