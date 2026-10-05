export interface Category {
  id: string
  name: string
  box_art_url?: string | null
}

export interface ChannelPreference {
  id: string
  broadcaster_user_id: string
  category_id: string
  category_name: string
  created_at: string
}

export interface GlobalPreferenceExclusion {
  id: string
  broadcaster_user_id: string
  created_at: string
}

export interface GlobalPreference {
  id: string
  category_id: string
  category_name: string
  created_at: string
  // Active exclusions embedded by GET /preferences (ADR 0054).
  exclusions: GlobalPreferenceExclusion[]
}

export interface PreferencesResponse {
  channel: ChannelPreference[]
  global: GlobalPreference[]
}
