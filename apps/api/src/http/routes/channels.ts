import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { buildFollowedChannelsView } from "../../services/followed-channels-view"
import { jsonResponse } from "../response"

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

  const items = buildFollowedChannelsView(channels, stateByBroadcasterId)

  return jsonResponse({ data: items })
}
