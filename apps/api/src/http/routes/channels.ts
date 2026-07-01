import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { jsonResponse } from "../response"

interface FollowedChannelItem {
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

export async function handleGetFollowedChannels(
  c: Context<HonoEnv>,
): Promise<Response> {
  const userId = c.var.userId
  const channels = await c.var.db.followedChannels.findByUserId(userId)

  if (channels.length === 0) return jsonResponse({ data: [] })

  const states = await c.var.db.channelState.findByBroadcasterUserIds(
    channels.map((ch) => ch.broadcaster_user_id),
  )
  const stateByBroadcasterId = new Map(
    states.map((s) => [s.broadcaster_user_id, s]),
  )

  const items: FollowedChannelItem[] = channels.map((ch) => {
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

  return jsonResponse({ data: items })
}
