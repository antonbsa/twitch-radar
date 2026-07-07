import type { AppConfig } from "../../env"
import { ApiError } from "../../http/errors"
import { decryptToken, encryptToken } from "../crypto"
import { TwitchApiError, refreshAccessToken } from "./client"
import type { Database } from "../../db"

const REFRESH_BUFFER_MS = 5 * 60 * 1000

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
    if (err instanceof TwitchApiError) {
      throw new ApiError(
        401,
        "reconnect_required",
        "Twitch token refresh failed — please reconnect your account",
      )
    }
    throw err
  }

  const now = new Date().toISOString()
  await db.twitchTokens.upsert({
    userId,
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
