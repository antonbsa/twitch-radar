const SESSION_TTL_S = 60 * 60 * 24 * 30 // 30 days
const OAUTH_STATE_TTL_S = 60 * 10 // 10 minutes

export const SESSION_COOKIE_NAME = "session"

interface SessionData {
  userId: string
  expiresAt: string
}

export async function createSession(
  kv: KVNamespace,
  userId: string,
): Promise<string> {
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_S * 1000).toISOString()
  await kv.put(
    `session:${sessionId}`,
    JSON.stringify({ userId, expiresAt } satisfies SessionData),
    { expirationTtl: SESSION_TTL_S },
  )
  return sessionId
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<{ userId: string } | null> {
  const raw = await kv.get(`session:${sessionId}`)
  if (!raw) return null
  const data = JSON.parse(raw) as SessionData
  if (new Date(data.expiresAt) < new Date()) return null
  return { userId: data.userId }
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  await kv.delete(`session:${sessionId}`)
}

// Sessions are keyed by sessionId, not userId, so removing "all sessions for
// a user" (test-seam cleanup) means scanning the session: prefix.
export async function deleteSessionsForUser(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: "session:", cursor })
    for (const key of page.keys) {
      const raw = await kv.get(key.name)
      if (!raw) continue
      const data = JSON.parse(raw) as SessionData
      if (data.userId === userId) await kv.delete(key.name)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}

export async function createOAuthState(kv: KVNamespace): Promise<string> {
  const state = crypto.randomUUID()
  await kv.put(`oauth_state:${state}`, "1", {
    expirationTtl: OAUTH_STATE_TTL_S,
  })
  return state
}

export async function consumeOAuthState(
  kv: KVNamespace,
  state: string,
): Promise<boolean> {
  const value = await kv.get(`oauth_state:${state}`)
  if (!value) return false
  await kv.delete(`oauth_state:${state}`)
  return true
}

export function sessionCookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_S}`
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}
