import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"
import { getValidAccessToken } from "../../services/twitch/token-refresh"
import { syncFollowedChannels } from "../../services/twitch/sync"
import {
  clearSyncCooldown,
  getSyncCooldownRemaining,
  startSyncCooldown,
} from "../../services/sync-cooldown"

export async function handleSyncFollows(
  c: Context<HonoEnv>,
): Promise<Response> {
  const userId = c.var.userId
  const user = await c.var.db.users.findById(userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const cooldownRemainingS = await getSyncCooldownRemaining(
    c.env.KV_APP_CACHE,
    userId,
  )
  if (cooldownRemainingS !== null) {
    throw new ApiError(
      429,
      "sync_rate_limited",
      "Synced recently. Try again in a bit",
    )
  }
  // Start before doing any work so concurrent/slow syncs count against it too.
  // Rolled back on 401 below since a broken session isn't the rate-limit risk
  // this guards against.
  await startSyncCooldown(c.env.KV_APP_CACHE, userId)

  try {
    const accessToken = await getValidAccessToken(
      c.var.db,
      c.var.config,
      userId,
    )
    await syncFollowedChannels(
      c.var.db,
      c.var.config,
      userId,
      user.twitch_user_id,
      accessToken,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSyncCooldown(c.env.KV_APP_CACHE, userId)
    }
    throw error
  }

  return jsonResponse({ ok: true })
}
