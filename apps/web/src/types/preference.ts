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
}

export interface GlobalPreference {
  id: string
  category_id: string
  category_name: string
}

export interface PreferencesResponse {
  channel: ChannelPreference[]
  global: GlobalPreference[]
}
