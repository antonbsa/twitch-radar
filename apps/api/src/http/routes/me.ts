import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { SUPPORTED_LANGUAGES } from "../../types"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"

const UpdateLanguageSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
})

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

// ADR 0044: sets the user's UI/notification language preference. Kept as its
// own endpoint (rather than a general-purpose PATCH /me) since language is
// the only user-editable field on this resource today.
export async function handleUpdateLanguage(
  c: Context<HonoEnv>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null)
  const parsed = UpdateLanguageSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", "Invalid language payload")
  }

  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const now = new Date().toISOString()
  await c.var.db.users.updateLanguage(c.var.userId, parsed.data.language, now)

  return jsonResponse({
    data: { ...user, language: parsed.data.language },
  })
}
