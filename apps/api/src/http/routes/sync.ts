import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"
import { getValidAccessToken } from "../../services/twitch/token-refresh"
import { syncFollowedChannels } from "../../services/twitch/sync"

export async function handleSyncFollows(
  c: Context<HonoEnv>,
): Promise<Response> {
  const userId = c.var.userId
  const user = await c.var.db.users.findById(userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const accessToken = await getValidAccessToken(c.var.db, c.var.config, userId)
  await syncFollowedChannels(
    c.var.db,
    c.var.config,
    userId,
    user.twitch_user_id,
    accessToken,
  )

  return jsonResponse({ ok: true })
}
