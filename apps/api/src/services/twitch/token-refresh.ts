import { scheduledJobLogFields } from "../../crons"
import type { AppConfig } from "../../env"
import { ApiError } from "../../http/errors"
import { logger, serializeError } from "../../lib/logger"
import { decryptToken, encryptToken } from "../../lib/crypto"
import { TwitchApiError, classifyTwitchError } from "./errors"
import { refreshAccessToken, validateAccessToken } from "./oauth"
import type { Database } from "../../db"
import type { TwitchTokenRecord } from "../../db/repositories/twitch-tokens"

const REFRESH_BUFFER_MS = 5 * 60 * 1000

// The scheduled sweep refreshes tokens due within this window so request-time
// refreshes stay the exception; runs twice per hour (ADR 0036), so the
// lookahead must comfortably exceed the run interval.
const SCHEDULED_REFRESH_LOOKAHEAD_MS = 45 * 60 * 1000
const MAX_SCHEDULED_REFRESHES_PER_RUN = 10

// Twitch asks for hourly validation of user tokens. The sweep runs twice per
// hour, so a 50 minute threshold validates each token about once an hour.
const VALIDATION_INTERVAL_MS = 50 * 60 * 1000
const MAX_VALIDATIONS_PER_RUN = 20

// Short KV lock per user so concurrent requests don't both spend the same
// refresh token (Twitch invalidates it on use). 60s is KV's minimum TTL.
const REFRESH_LOCK_TTL_S = 60
const LOCK_WAIT_POLL_MS = 400
const LOCK_WAIT_POLLS = 6

// A 4xx other than 429 means Twitch rejected the refresh token itself; 429 and
// 5xx say nothing about it, so those must not flag the row or ask for a reconnect.
function isDeadRefreshStatus(status: number): boolean {
  return status < 500 && status !== 429
}

/**
 * Refreshes one stored token and persists the result. A 4xx from Twitch
 * means the refresh token itself is dead (revoked or expired) — the row is
 * flagged `refresh_failed_at` so `/api/me` surfaces the reconnect state and
 * the sweep stops retrying it; only a successful re-auth or refresh clears
 * the flag (via the upsert). Transient errors flag nothing and just rethrow.
 */
async function refreshAndStoreToken(
  db: Database,
  config: AppConfig,
  record: TwitchTokenRecord,
): Promise<string> {
  const refreshToken = await decryptToken(
    record.refresh_token,
    config.tokenEncryptionKey,
  )

  let refreshed
  try {
    refreshed = await refreshAccessToken(
      config.twitchClientId,
      config.twitchClientSecret,
      refreshToken,
      config.twitchAuthBaseUrl,
    )
  } catch (err) {
    if (err instanceof TwitchApiError && isDeadRefreshStatus(err.status)) {
      await db.twitchTokens.markRefreshFailed(
        record.user_id,
        new Date().toISOString(),
      )
    }
    throw err
  }

  const now = new Date().toISOString()
  await db.twitchTokens.upsert({
    userId: record.user_id,
    accessToken: await encryptToken(
      refreshed.access_token,
      config.tokenEncryptionKey,
    ),
    refreshToken: await encryptToken(
      refreshed.refresh_token,
      config.tokenEncryptionKey,
    ),
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    scopes: refreshed.scope.join(" "),
    now,
  })

  return refreshed.access_token
}

function refreshLockKey(userId: string): string {
  return `token_refresh_lock:${userId}`
}

/**
 * A request that lost the lock doesn't refresh (the winner's write would make
 * its own refresh token dead) and doesn't fail: it re-reads the token from D1
 * until the winner's write lands, or after a few polls uses what is stored.
 */
async function waitForConcurrentRefresh(
  db: Database,
  config: AppConfig,
  record: TwitchTokenRecord,
): Promise<string> {
  for (let i = 0; i < LOCK_WAIT_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS))
    const latest = await db.twitchTokens.findByUserId(record.user_id)
    if (!latest) break
    if (latest.refresh_failed_at) throw reconnectRequiredError()
    if (latest.access_token !== record.access_token) {
      return decryptToken(latest.access_token, config.tokenEncryptionKey)
    }
  }
  const latest = (await db.twitchTokens.findByUserId(record.user_id)) ?? record
  return decryptToken(latest.access_token, config.tokenEncryptionKey)
}

/**
 * `refreshAndStoreToken` behind the per-user KV lock. KV has no atomic
 * set-if-absent, so the lock narrows the race rather than closing it; the D1
 * re-read after taking it catches a refresh that finished in the gap.
 */
async function refreshWithLock(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  record: TwitchTokenRecord,
): Promise<string> {
  const key = refreshLockKey(record.user_id)
  if (await kv.get(key)) return waitForConcurrentRefresh(db, config, record)

  await kv.put(key, "1", { expirationTtl: REFRESH_LOCK_TTL_S })
  try {
    const latest = await db.twitchTokens.findByUserId(record.user_id)
    if (latest && latest.access_token !== record.access_token) {
      return await decryptToken(latest.access_token, config.tokenEncryptionKey)
    }
    return await refreshAndStoreToken(db, config, record)
  } finally {
    await kv.delete(key)
  }
}

function reconnectRequiredError(): ApiError {
  return new ApiError(
    401,
    "reconnect_required",
    "Twitch token refresh failed — please reconnect your account",
  )
}

/** Locked refresh for a request: a dead refresh token is `reconnect_required`, anything else `classifyTwitchError`. */
async function refreshForRequest(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  record: TwitchTokenRecord,
): Promise<string> {
  try {
    return await refreshWithLock(db, config, kv, record)
  } catch (err) {
    if (err instanceof TwitchApiError && isDeadRefreshStatus(err.status)) {
      throw reconnectRequiredError()
    }
    throw classifyTwitchError(err)
  }
}

async function loadTokenRecord(
  db: Database,
  userId: string,
): Promise<TwitchTokenRecord> {
  const record = await db.twitchTokens.findByUserId(userId)
  if (!record)
    throw new ApiError(401, "auth_required", "No Twitch token on record")
  return record
}

/**
 * Runs `fn` with the user's Twitch access token: the one place request-time
 * Helix calls get their token and have upstream failures classified.
 *
 * - Refreshes first when the token expires within 5 min.
 * - An upstream 401 on a token that looked valid (revoked grant, or rotated by
 *   another request) refreshes once and retries; a second 401 flags the row and
 *   throws `401 reconnect_required`, same as a dead refresh token.
 * - 429/5xx become `twitch_unavailable` (see `classifyTwitchError`).
 * @throws ApiError 401 `auth_required` (no token row) or `reconnect_required`.
 */
export async function withUserAccessToken<T>(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  userId: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const record = await loadTokenRecord(db, userId)
  let accessToken = await decryptToken(
    record.access_token,
    config.tokenEncryptionKey,
  )
  if (new Date(record.expires_at).getTime() - Date.now() <= REFRESH_BUFFER_MS) {
    accessToken = await refreshForRequest(db, config, kv, record)
  }

  try {
    return await fn(accessToken)
  } catch (err) {
    if (!(err instanceof TwitchApiError && err.status === 401)) {
      throw classifyTwitchError(err)
    }
  }

  // Reuse a token another request already rotated in; only refresh if the
  // one that just got a 401 is still what is stored.
  const latest = await loadTokenRecord(db, userId)
  let retryToken = await decryptToken(
    latest.access_token,
    config.tokenEncryptionKey,
  )
  if (retryToken === accessToken) {
    retryToken = await refreshForRequest(db, config, kv, latest)
  }

  try {
    return await fn(retryToken)
  } catch (err) {
    if (err instanceof TwitchApiError && err.status === 401) {
      await db.twitchTokens.markRefreshFailed(userId, new Date().toISOString())
      throw reconnectRequiredError()
    }
    throw classifyTwitchError(err)
  }
}

/**
 * Scheduled sweep (ADR 0036): proactively refreshes tokens expiring soon so
 * event-driven work (state seeding, follow sync) rarely hits an expired
 * token at request time, then validates the ones not checked recently.
 * Rows already flagged `refresh_failed_at` are excluded by both queries —
 * retrying a dead refresh token can't succeed.
 */
export async function refreshExpiringTwitchTokens(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  const logFields = scheduledJobLogFields("token-refresh")
  try {
    const cutoff = new Date(
      Date.now() + SCHEDULED_REFRESH_LOOKAHEAD_MS,
    ).toISOString()
    const expiring = await db.twitchTokens.findExpiringBefore(
      cutoff,
      MAX_SCHEDULED_REFRESHES_PER_RUN,
    )
    let succeeded = 0

    for (const record of expiring) {
      try {
        await refreshWithLock(db, config, kv, record)
        succeeded += 1
      } catch (error) {
        logger.error("Scheduled Twitch token refresh failed", {
          ...logFields,
          userId: record.user_id,
          ...serializeError(error),
        })
      }
    }

    logger.info("Scheduled Twitch token refresh sweep completed", {
      ...logFields,
      attempted: expiring.length,
      succeeded,
      failed: expiring.length - succeeded,
    })
  } catch (error) {
    // Covers a D1 read failure (findExpiringBefore) or anything else thrown
    // outside the per-record handling above, so it's logged with full detail
    // instead of escaping as Cloudflare's bare automatic exception capture.
    logger.error("Scheduled Twitch token refresh sweep failed", {
      ...logFields,
      ...serializeError(error),
    })
  }

  await validateTwitchTokens(db, config, kv)
}

/**
 * Hourly-ish `/oauth2/validate` sweep: catches a grant revoked on Twitch's
 * side before a request trips on it. A 401 from validate also happens for a
 * merely expired access token, so it is confirmed by a refresh: only a dead
 * refresh token flags the row (`refreshAndStoreToken`). Run after the refresh
 * pass, whose upserts already stamped `validated_at` on what they renewed.
 */
async function validateTwitchTokens(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  const logFields = scheduledJobLogFields("token-refresh")
  try {
    const due = await db.twitchTokens.findDueForValidation(
      new Date(Date.now() - VALIDATION_INTERVAL_MS).toISOString(),
      MAX_VALIDATIONS_PER_RUN,
    )
    let valid = 0
    let revalidated = 0
    let failed = 0

    for (const record of due) {
      try {
        const accessToken = await decryptToken(
          record.access_token,
          config.tokenEncryptionKey,
        )
        if (await validateAccessToken(accessToken, config.twitchAuthBaseUrl)) {
          await db.twitchTokens.markValidated(
            record.user_id,
            new Date().toISOString(),
          )
          valid += 1
        } else {
          await refreshWithLock(db, config, kv, record)
          revalidated += 1
        }
      } catch (error) {
        failed += 1
        logger.error("Twitch token validation failed", {
          ...logFields,
          userId: record.user_id,
          ...serializeError(error),
        })
      }
    }

    logger.info("Twitch token validation sweep completed", {
      ...logFields,
      attempted: due.length,
      valid,
      refreshedAfterInvalid: revalidated,
      failed,
    })
  } catch (error) {
    logger.error("Twitch token validation sweep failed", {
      ...logFields,
      ...serializeError(error),
    })
  }
}
