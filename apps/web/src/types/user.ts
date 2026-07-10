export interface User {
  id: string
  twitch_user_id: string
  twitch_login: string
  twitch_display_name: string
  created_at: string
  updated_at: string
  last_follow_sync_at: string | null
  // True when the stored Twitch refresh token is dead and the user must
  // reconnect via OAuth (surfaced by GET /api/me, ADR 0036).
  twitch_reconnect_required: boolean
}
