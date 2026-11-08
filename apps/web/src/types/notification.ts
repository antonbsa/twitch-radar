export interface NotificationSnooze {
  id: string
  user_id: string
  broadcaster_user_id: string
  category_id: string
  fire_at: string
  status: string
  created_at: string
}

export interface BroadcasterMute {
  id: string
  broadcaster_user_id: string
  created_at: string
}
