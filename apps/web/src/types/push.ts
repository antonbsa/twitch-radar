// Mirrors apps/api's PushSubscriptionRecord snake_case fields exactly (not
// shared/imported across the workspace boundary — see ADR 0012).
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
