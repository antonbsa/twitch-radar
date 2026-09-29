import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"
import { getValidAccessToken } from "../../services/twitch/token-refresh"
import {
  fetchFollowedChannelsSync,
  persistFollowedChannelsSyncDeferred,
} from "../../services/twitch/sync"

export async function handleSyncFollows(
  c: Context<HonoEnv>,
): Promise<Response> {
  const db = c.var.db
  const config = c.var.config
  const userId = c.var.userId
  const user = await db.users.findById(userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const accessToken = await getValidAccessToken(db, config, userId)
  const fetched = await fetchFollowedChannelsSync(
    config,
    user.twitch_user_id,
    accessToken,
  )

  // Respond as soon as the Twitch fetch resolves (issue #83); the D1 writes
  // and monitoring maintenance continue after the response is sent.
  c.executionCtx.waitUntil(
    persistFollowedChannelsSyncDeferred(
      db,
      config,
      userId,
      fetched,
      new Date().toISOString(),
    ),
  )

  return jsonResponse({ data: fetched.payload })
}
