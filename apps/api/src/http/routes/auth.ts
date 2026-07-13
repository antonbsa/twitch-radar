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
    config.twitchAuthBaseUrl,
  )

  const twitchUser = await getAuthenticatedUser(
    config.twitchClientId,
    tokens.access_token,
    config.twitchApiBaseUrl,
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

  // Not a 302: Safari has a long-standing bug (WebKit bug 188165) where a
  // Set-Cookie set on the same response as a Location redirect is silently
  // dropped for a cross-site navigation chain (id.twitch.tv -> here), which
  // left mobile Safari users "logged out" immediately after completing
  // Twitch login. Landing on a real 200 response first, then redirecting
  // client-side, gives the cookie a response of its own to commit on.
  const headers = new Headers()
  headers.set("Set-Cookie", sessionCookieHeader(sessionId))
  headers.set("Content-Type", "text/html; charset=utf-8")
  const target = config.publicUrl
  const body = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${target}"></head><body><script>location.replace(${JSON.stringify(target)})</script></body></html>`
  return new Response(body, { status: 200, headers })
}

export async function handleLogout(c: Context<HonoEnv>): Promise<Response> {
  await deleteSession(c.env.APP_CACHE, c.var.sessionId)
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearSessionCookieHeader() },
  })
}
