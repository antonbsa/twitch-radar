import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"

export async function handleGetMe(c: Context<HonoEnv>): Promise<Response> {
  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  // Reconnect state surfaced by token refresh failures (ADR 0036): true when
  // the stored refresh token is dead (or gone) and a new OAuth round-trip is
  // the only fix.
  const token = await c.var.db.twitchTokens.findByUserId(c.var.userId)
  const twitchReconnectRequired = !token || token.refresh_failed_at !== null

  return jsonResponse({
    data: { ...user, twitch_reconnect_required: twitchReconnectRequired },
  })
}
