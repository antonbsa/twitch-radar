const SESSION_TTL_S = 60 * 60 * 24 * 30 // 30 days
// Sliding sessions: activity renews the TTL, but never past this ceiling from
// login, so a stolen-but-unused cookie can't keep itself alive forever.
const SESSION_MAX_LIFETIME_S = 60 * 60 * 24 * 180 // 180 days
// A session is renewed only once it is this close to expiring, so an active
// user costs one KV write per week instead of one per request.
const SESSION_RENEW_WINDOW_S = 60 * 60 * 24 * 7 // 7 days
// KV rejects an expirationTtl below 60 seconds (apps/api/AGENTS.md "KV gotchas").
const KV_MIN_TTL_S = 60
const OAUTH_STATE_TTL_S = 60 * 10 // 10 minutes

export const SESSION_COOKIE_NAME = "session"

interface SessionData {
  userId: string
  expiresAt: string
  /** Absolute ceiling `expiresAt` can be renewed up to. */
  maxExpiresAt: string
}

/** `ttlS`/`maxLifetimeS` only exist so the test seam can seed a session about to expire. */
export async function createSession(
  kv: KVNamespace,
  userId: string,
  { ttlS = SESSION_TTL_S, maxLifetimeS = SESSION_MAX_LIFETIME_S } = {},
): Promise<string> {
  const sessionId = crypto.randomUUID()
  const now = Date.now()
  await kv.put(
    `session:${sessionId}`,
    JSON.stringify({
      userId,
      expiresAt: new Date(now + ttlS * 1000).toISOString(),
      maxExpiresAt: new Date(now + maxLifetimeS * 1000).toISOString(),
    } satisfies SessionData),
    { expirationTtl: ttlS },
  )
  return sessionId
}

/**
 * Slides the session: within the last week of its TTL it is renewed to the
 * full TTL, bounded by `maxExpiresAt`.
 * @returns `null` for a missing or expired session; `renewedTtlS` is set when
 * the session was just renewed, so the caller can refresh the cookie too.
 */
export async function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<{ userId: string; renewedTtlS?: number } | null> {
  const key = `session:${sessionId}`
  const raw = await kv.get(key)
  if (!raw) return null
  const data = JSON.parse(raw) as SessionData
  const now = Date.now()
  const expiresAt = Date.parse(data.expiresAt)
  if (expiresAt < now) return null

  if (expiresAt - now > SESSION_RENEW_WINDOW_S * 1000) {
    return { userId: data.userId }
  }
  const renewedExpiresAt = Math.min(
    now + SESSION_TTL_S * 1000,
    Date.parse(data.maxExpiresAt),
  )
  const renewedTtlS = Math.floor((renewedExpiresAt - now) / 1000)
  // Also false when `maxExpiresAt` is missing or invalid (NaN).
  if (!(renewedExpiresAt > expiresAt) || renewedTtlS < KV_MIN_TTL_S) {
    return { userId: data.userId }
  }
  await kv.put(
    key,
    JSON.stringify({
      ...data,
      expiresAt: new Date(renewedExpiresAt).toISOString(),
    } satisfies SessionData),
    { expirationTtl: renewedTtlS },
  )
  return { userId: data.userId, renewedTtlS }
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  await kv.delete(`session:${sessionId}`)
}

/**
 * Sessions are keyed by sessionId, not userId, so removing "all sessions for
 * a user" (test-seam cleanup) means scanning the session: prefix.
 */
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

/** @returns `true` when the state was valid; it is now consumed (single use). */
export async function consumeOAuthState(
  kv: KVNamespace,
  state: string,
): Promise<boolean> {
  const value = await kv.get(`oauth_state:${state}`)
  if (!value) return false
  await kv.delete(`oauth_state:${state}`)
  return true
}

export function sessionCookieHeader(
  sessionId: string,
  maxAgeS = SESSION_TTL_S,
): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeS}`
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}
