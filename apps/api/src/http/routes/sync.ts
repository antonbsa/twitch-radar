import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"
import { getValidAccessToken } from "../../services/twitch/token-refresh"
import { syncFollowedChannels } from "../../services/twitch/sync"

// Cheap per-user guard against mashing the "Sync" button, not a general rate
// limiter. Derived from followed_channels.last_synced_at (ADR 0032) rather
// than a dedicated KV write - this only reflects *completed* syncs, so two
// concurrent sync requests can both pass; acceptable for a single-user app.
const SYNC_COOLDOWN_TTL_S = 60

export async function handleSyncFollows(
  c: Context<HonoEnv>,
): Promise<Response> {
  const userId = c.var.userId
  const user = await c.var.db.users.findById(userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const mostRecentSyncedAt =
    await c.var.db.followedChannels.findMostRecentSyncedAt(userId)
  if (mostRecentSyncedAt) {
    const elapsedS = (Date.now() - Date.parse(mostRecentSyncedAt)) / 1000
    if (elapsedS < SYNC_COOLDOWN_TTL_S) {
      throw new ApiError(
        429,
        "sync_rate_limited",
        "Synced recently. Try again in a bit",
      )
    }
  }

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
