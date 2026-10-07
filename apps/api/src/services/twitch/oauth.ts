import { twitchApiErrorFromResponse } from "./errors"

export interface TwitchTokenResponse {
  access_token: string
  refresh_token: string
  /** Seconds until the access token expires. */
  expires_in: number
  scope: string[]
  token_type: string
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  authBaseUrl = "https://id.twitch.tv",
): Promise<TwitchTokenResponse> {
  const res = await fetch(`${authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok)
    throw await twitchApiErrorFromResponse(`Token exchange failed`, res)
  return res.json() as Promise<TwitchTokenResponse>
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  authBaseUrl = "https://id.twitch.tv",
): Promise<TwitchTokenResponse> {
  const res = await fetch(`${authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok)
    throw await twitchApiErrorFromResponse(`Token refresh failed`, res)
  return res.json() as Promise<TwitchTokenResponse>
}

export interface TwitchAppTokenResponse {
  access_token: string
  /** Seconds until the access token expires. */
  expires_in: number
  token_type: string
}

/**
 * Client-credentials grant. EventSub webhook subscriptions (and the queue
 * consumer's stream lookups) authenticate as the app, not as a user.
 */
export async function fetchAppAccessToken(
  clientId: string,
  clientSecret: string,
  authBaseUrl = "https://id.twitch.tv",
): Promise<TwitchAppTokenResponse> {
  const res = await fetch(`${authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  })
  if (!res.ok)
    throw await twitchApiErrorFromResponse(`App token fetch failed`, res)
  return res.json() as Promise<TwitchAppTokenResponse>
}

/**
 * Twitch asks apps to validate user tokens hourly; this is also the cheap way
 * to notice a revoked grant without waiting for a request to fail.
 * @returns `false` on a 401 (invalid or expired token); other failures throw.
 */
export async function validateAccessToken(
  accessToken: string,
  authBaseUrl = "https://id.twitch.tv",
): Promise<boolean> {
  const res = await fetch(`${authBaseUrl}/oauth2/validate`, {
    headers: { Authorization: `OAuth ${accessToken}` },
  })
  if (res.ok) return true
  if (res.status === 401) return false
  throw await twitchApiErrorFromResponse(`Token validation failed`, res)
}
