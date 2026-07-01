export interface TwitchTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string[]
  token_type: string
}

export interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
}

export interface TwitchFollowedChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
}

export interface TwitchFollowedStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_id: string
  game_name: string
  type: string
  title: string
  viewer_count: number
  started_at: string
}

export class TwitchApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "TwitchApiError"
    this.status = status
  }
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<TwitchTokenResponse> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
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
  if (!res.ok) throw new TwitchApiError(`Token exchange failed`, res.status)
  return res.json() as Promise<TwitchTokenResponse>
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<TwitchTokenResponse> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new TwitchApiError(`Token refresh failed`, res.status)
  return res.json() as Promise<TwitchTokenResponse>
}

export async function getAuthenticatedUser(
  clientId: string,
  accessToken: string,
): Promise<TwitchUser> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new TwitchApiError(`User profile fetch failed`, res.status)
  const body = (await res.json()) as { data: TwitchUser[] }
  const user = body.data[0]
  if (!user) throw new TwitchApiError("No user in Twitch response", 200)
  return user
}

export async function getAllFollowedChannels(
  clientId: string,
  accessToken: string,
  userId: string,
): Promise<TwitchFollowedChannel[]> {
  const results: TwitchFollowedChannel[] = []
  let cursor: string | undefined

  do {
    const url = new URL("https://api.twitch.tv/helix/channels/followed")
    url.searchParams.set("user_id", userId)
    url.searchParams.set("first", "100")
    if (cursor) url.searchParams.set("after", cursor)

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok)
      throw new TwitchApiError(`Followed channels fetch failed`, res.status)
    const body = (await res.json()) as {
      data: TwitchFollowedChannel[]
      pagination?: { cursor?: string }
    }
    results.push(...body.data)
    cursor = body.pagination?.cursor
  } while (cursor)

  return results
}

export async function getAllFollowedStreams(
  clientId: string,
  accessToken: string,
  userId: string,
): Promise<TwitchFollowedStream[]> {
  const results: TwitchFollowedStream[] = []
  let cursor: string | undefined

  do {
    const url = new URL("https://api.twitch.tv/helix/streams/followed")
    url.searchParams.set("user_id", userId)
    url.searchParams.set("first", "100")
    if (cursor) url.searchParams.set("after", cursor)

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok)
      throw new TwitchApiError(`Followed streams fetch failed`, res.status)
    const body = (await res.json()) as {
      data: TwitchFollowedStream[]
      pagination?: { cursor?: string }
    }
    results.push(...body.data)
    cursor = body.pagination?.cursor
  } while (cursor)

  return results
}
