export interface FollowedChannel {
  broadcaster_user_id: string
  broadcaster_login: string
  broadcaster_display_name: string
  broadcaster_profile_image_url: string | null
  followed_at: string | null
  is_live: boolean
  stream_id: string | null
  category_id: string | null
  category_name: string | null
  title: string | null
  viewer_count: number | null
  started_at: string | null
}
