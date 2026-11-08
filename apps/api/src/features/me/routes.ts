import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import type { MeResponse } from "../../contracts/me"
import { SUPPORTED_LANGUAGES, type User } from "../../db/repositories/users"
import { ApiError } from "../../http/errors"
import { parseBody } from "../../http/handlers"
import { jsonResponse } from "../../http/response"

const UpdateLanguageSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
})

const UpdateNotificationsPausedSchema = z.object({ paused: z.boolean() })

export async function handleGetMe(c: Context<HonoEnv>): Promise<Response> {
  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  return meResponse(c, user)
}

/** The full user every `/me` route returns, so one contract covers them all (ADR 0067). */
async function meResponse(c: Context<HonoEnv>, user: User): Promise<Response> {
  // Reconnect state surfaced by token refresh failures (ADR 0036): true when
  // the stored refresh token is dead (or gone) and a new OAuth round-trip is
  // the only fix.
  const token = await c.var.db.twitchTokens.findByUserId(user.id)
  const twitchReconnectRequired = !token || token.refresh_failed_at !== null

  return jsonResponse({
    data: { ...user, twitch_reconnect_required: twitchReconnectRequired },
  } satisfies MeResponse)
}

/**
 * ADR 0044: sets the user's UI/notification language preference.
 */
export async function handleUpdateLanguage(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { language } = await parseBody(
    c,
    UpdateLanguageSchema,
    "Invalid language payload",
  )

  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const now = new Date().toISOString()
  await c.var.db.users.updateLanguage(c.var.userId, language, now)

  return meResponse(c, { ...user, language, updated_at: now })
}

/**
 * ADR 0054: pauses (`paused: true`) or resumes all notifications. Pausing an
 * already-paused user keeps the original timestamp.
 */
export async function handleUpdateNotificationsPaused(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { paused } = await parseBody(
    c,
    UpdateNotificationsPausedSchema,
    "Invalid pause payload",
  )

  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")

  const now = new Date().toISOString()
  const pausedAt = paused ? (user.notifications_paused_at ?? now) : null
  await c.var.db.users.setNotificationsPausedAt(c.var.userId, pausedAt, now)

  return meResponse(c, {
    ...user,
    notifications_paused_at: pausedAt,
    updated_at: now,
  })
}
