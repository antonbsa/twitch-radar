import type { AppConfig } from "../../env"
import { ApiError } from "../../http/errors"
import { logger, serializeError } from "../../logger"
import { decryptToken, encryptToken } from "../crypto"
import { TwitchApiError, refreshAccessToken } from "./client"
import type { Database } from "../../db"
import type { TwitchTokenRecord } from "../../db/repositories/twitch-tokens"

const REFRESH_BUFFER_MS = 5 * 60 * 1000

// The scheduled sweep refreshes tokens due within this window so request-time
// refreshes stay the exception; runs twice per hour (ADR 0036), so the
// lookahead must comfortably exceed the run interval.
const SCHEDULED_REFRESH_LOOKAHEAD_MS = 45 * 60 * 1000
const MAX_SCHEDULED_REFRESHES_PER_RUN = 10

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
    if (err instanceof TwitchApiError && err.status < 500) {
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

export async function getValidAccessToken(
  db: Database,
  config: AppConfig,
  userId: string,
): Promise<string> {
  const record = await db.twitchTokens.findByUserId(userId)
  if (!record)
    throw new ApiError(401, "auth_required", "No Twitch token on record")

  const accessToken = await decryptToken(
    record.access_token,
    config.tokenEncryptionKey,
  )

  if (new Date(record.expires_at).getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return accessToken
  }

  try {
    return await refreshAndStoreToken(db, config, record)
  } catch (err) {
    if (err instanceof TwitchApiError) {
      throw new ApiError(
        401,
        "reconnect_required",
        "Twitch token refresh failed — please reconnect your account",
      )
    }
    throw err
  }
}

/**
 * Scheduled sweep (ADR 0036): proactively refreshes tokens expiring soon so
 * event-driven work (state seeding, follow sync) rarely hits an expired
 * token at request time. Rows already flagged `refresh_failed_at` are
 * excluded by the query — retrying a dead refresh token can't succeed.
 */
export async function refreshExpiringTwitchTokens(
  db: Database,
  config: AppConfig,
): Promise<void> {
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
      await refreshAndStoreToken(db, config, record)
      succeeded += 1
    } catch (error) {
      logger.error("Scheduled Twitch token refresh failed", {
        userId: record.user_id,
        ...serializeError(error),
      })
    }
  }

  logger.info("Scheduled Twitch token refresh sweep completed", {
    attempted: expiring.length,
    succeeded,
    failed: expiring.length - succeeded,
  })
}
