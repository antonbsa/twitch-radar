import type { MiddlewareHandler } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { SESSION_COOKIE_NAME, getSession } from "../../services/session"

function parseSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === SESSION_COOKIE_NAME) return rest.join("=") || null
  }
  return null
}

export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const sessionId = parseSessionCookie(c.req.raw)
  if (!sessionId) {
    throw new ApiError(401, "auth_required", "Authentication required")
  }

  const session = await getSession(c.env.APP_CACHE, sessionId)
  if (!session) {
    throw new ApiError(401, "session_expired", "Session expired or invalid")
  }

  c.set("userId", session.userId)
  c.set("sessionId", sessionId)
  return next()
}
