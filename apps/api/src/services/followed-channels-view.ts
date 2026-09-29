export interface FollowedChannelViewItem {
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
  thumbnail_url: string | null
  viewer_count: number | null
  started_at: string | null
}

export interface FollowedChannelViewSource {
  broadcaster_user_id: string
  broadcaster_login: string
  broadcaster_display_name: string
  broadcaster_profile_image_url: string | null
  followed_at: string | null
}

export interface ChannelStateViewSource {
  is_live: boolean
  stream_id: string | null
  category_id: string | null
  category_name: string | null
  title: string | null
  thumbnail_url: string | null
  viewer_count: number | null
  started_at: string | null
}

/**
 * Joins followed channels with their current live state and sorts them
 * live-first / highest-viewer-count / display-name ascending. Shared by
 * `GET /channels/followed` (reading from D1) and `POST /sync/follows`
 * (building the same shape from data already resolved in memory, issue
 * #83) so the two routes can't drift on the join/sort logic.
 */
export function buildFollowedChannelsView(
  channels: FollowedChannelViewSource[],
  stateByBroadcasterId: Map<string, ChannelStateViewSource>,
): FollowedChannelViewItem[] {
  const items: FollowedChannelViewItem[] = channels.map((ch) => {
    const state = stateByBroadcasterId.get(ch.broadcaster_user_id)
    return {
      broadcaster_user_id: ch.broadcaster_user_id,
      broadcaster_login: ch.broadcaster_login,
      broadcaster_display_name: ch.broadcaster_display_name,
      broadcaster_profile_image_url: ch.broadcaster_profile_image_url,
      followed_at: ch.followed_at,
      is_live: state?.is_live ?? false,
      stream_id: state?.stream_id ?? null,
      category_id: state?.category_id ?? null,
      category_name: state?.category_name ?? null,
      title: state?.title ?? null,
      thumbnail_url: state?.thumbnail_url ?? null,
      viewer_count: state?.viewer_count ?? null,
      started_at: state?.started_at ?? null,
    }
  })

  items.sort((a, b) => {
    if (a.is_live !== b.is_live) return a.is_live ? -1 : 1
    if (a.is_live && b.is_live) {
      const diff = (b.viewer_count ?? 0) - (a.viewer_count ?? 0)
      if (diff !== 0) return diff
    }
    return a.broadcaster_display_name.localeCompare(b.broadcaster_display_name)
  })

  return items
}
