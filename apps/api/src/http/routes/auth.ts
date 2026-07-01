import type { Context } from "hono"
import { nanoid } from "nanoid"
import type { HonoEnv } from "../../env"
import { encryptToken } from "../../services/crypto"
import {
  clearSessionCookieHeader,
  consumeOAuthState,
  createOAuthState,
  createSession,
  deleteSession,
  sessionCookieHeader,
} from "../../services/session"
import {
  exchangeCode,
  getAuthenticatedUser,
} from "../../services/twitch/client"
import { ApiError } from "../errors"

export async function handleAuthStart(c: Context<HonoEnv>): Promise<Response> {
  const config = c.var.config
  const state = await createOAuthState(c.env.APP_CACHE)

  const url = new URL("https://id.twitch.tv/oauth2/authorize")
  url.searchParams.set("client_id", config.twitchClientId)
  url.searchParams.set("redirect_uri", config.twitchRedirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "user:read:follows")
  url.searchParams.set("state", state)

  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  })
}

export async function handleAuthCallback(
  c: Context<HonoEnv>,
): Promise<Response> {
  const config = c.var.config
  const code = c.req.query("code")
  const state = c.req.query("state")

  if (!code || !state) {
    throw new ApiError(
      400,
      "invalid_request",
      "Missing code or state parameter",
    )
  }

  const stateValid = await consumeOAuthState(c.env.APP_CACHE, state)
  if (!stateValid) {
    throw new ApiError(400, "invalid_state", "OAuth state mismatch or expired")
  }

  const tokens = await exchangeCode(
    config.twitchClientId,
    config.twitchClientSecret,
    code,
    config.twitchRedirectUri,
  )

  const twitchUser = await getAuthenticatedUser(
    config.twitchClientId,
    tokens.access_token,
  )

  const now = new Date().toISOString()
  const existing = await c.var.db.users.findByTwitchUserId(twitchUser.id)
  const userId = existing?.id ?? `usr_${nanoid()}`

  await c.var.db.users.upsert({
    id: userId,
    twitchUserId: twitchUser.id,
    twitchLogin: twitchUser.login,
    twitchDisplayName: twitchUser.display_name,
    now,
  })

  await c.var.db.twitchTokens.upsert({
    userId,
    accessToken: await encryptToken(
      tokens.access_token,
      config.tokenEncryptionKey,
    ),
    refreshToken: await encryptToken(
      tokens.refresh_token,
      config.tokenEncryptionKey,
    ),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scopes: tokens.scope.join(" "),
    now,
  })

  const sessionId = await createSession(c.env.APP_CACHE, userId)

  const headers = new Headers()
  headers.set("Set-Cookie", sessionCookieHeader(sessionId))
  headers.set("Location", config.publicBaseUrl)
  return new Response(null, { status: 302, headers })
}

export async function handleLogout(c: Context<HonoEnv>): Promise<Response> {
  await deleteSession(c.env.APP_CACHE, c.var.sessionId)
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearSessionCookieHeader() },
  })
}
