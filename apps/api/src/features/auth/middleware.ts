import { getCookie } from "hono/cookie"
import type { MiddlewareHandler } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../../http/errors"
import { SESSION_COOKIE_NAME, getSession, sessionCookieHeader } from "./session"

export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME)
  if (!sessionId) {
    throw new ApiError(401, "auth_required", "Authentication required")
  }

  const session = await getSession(c.env.KV_APP_CACHE, sessionId)
  if (!session) {
    throw new ApiError(401, "session_expired", "Session expired or invalid")
  }

  c.set("userId", session.userId)
  c.set("sessionId", sessionId)
  await next()
  // The browser drops the cookie at its own Max-Age, so a renewed session
  // needs a fresh cookie too (unless the handler set one itself, e.g. logout).
  if (session.renewedTtlS && !c.res.headers.has("Set-Cookie")) {
    c.header("Set-Cookie", sessionCookieHeader(sessionId, session.renewedTtlS))
  }
}
