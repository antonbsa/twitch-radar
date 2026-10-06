import { TwitchApiError, readErrorBody } from "./errors"

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
    throw new TwitchApiError(
      `Token exchange failed`,
      res.status,
      await readErrorBody(res),
    )
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
    throw new TwitchApiError(
      `Token refresh failed`,
      res.status,
      await readErrorBody(res),
    )
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
    throw new TwitchApiError(
      `App token fetch failed`,
      res.status,
      await readErrorBody(res),
    )
  return res.json() as Promise<TwitchAppTokenResponse>
}
