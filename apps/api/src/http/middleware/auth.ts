import { getCookie } from "hono/cookie"
import type { MiddlewareHandler } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { SESSION_COOKIE_NAME, getSession } from "../../services/session"

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
  return next()
}
