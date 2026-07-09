import type { AppConfig } from "../../env"
import { fetchAppAccessToken } from "./client"

// Exported so the test seam can evict the cache between tests.
export const APP_TOKEN_KV_KEY = "twitch:app_access_token"

// Refetch this long before Twitch's expiry so in-flight calls never race it.
const EXPIRY_BUFFER_SECONDS = 5 * 60

/**
 * App access token (client-credentials grant) cached in KV until shortly
 * before expiry. Twitch app tokens live ~60 days, so in practice this is a
 * KV read; a concurrent cache miss just fetches twice, which is harmless
 * (Twitch allows multiple valid app tokens per client).
 */
export async function getAppAccessToken(
  kv: KVNamespace,
  config: AppConfig,
): Promise<string> {
  const cached = await kv.get(APP_TOKEN_KV_KEY)
  if (cached) return cached

  const token = await fetchAppAccessToken(
    config.twitchClientId,
    config.twitchClientSecret,
    config.twitchAuthBaseUrl,
  )
  // KV enforces a 60s minimum TTL.
  const ttl = Math.max(60, token.expires_in - EXPIRY_BUFFER_SECONDS)
  await kv.put(APP_TOKEN_KV_KEY, token.access_token, { expirationTtl: ttl })
  return token.access_token
}
