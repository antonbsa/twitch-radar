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

export interface TwitchCategory {
  id: string
  name: string
  box_art_url: string | null
}

export interface TwitchStream {
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
  if (!res.ok) throw new TwitchApiError(`Token exchange failed`, res.status)
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
  if (!res.ok) throw new TwitchApiError(`Token refresh failed`, res.status)
  return res.json() as Promise<TwitchTokenResponse>
}

export interface TwitchAppTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// Client-credentials grant. EventSub webhook subscriptions (and the queue
// consumer's stream lookups) authenticate as the app, not as a user.
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
  if (!res.ok) throw new TwitchApiError(`App token fetch failed`, res.status)
  return res.json() as Promise<TwitchAppTokenResponse>
}

export interface CreateEventsubSubscriptionInput {
  type: string
  version: string
  broadcasterUserId: string
  callbackUrl: string
  secret: string
}

export interface TwitchEventsubSubscription {
  id: string
  status: string
  type: string
  version: string
}

export async function createEventsubSubscription(
  clientId: string,
  appAccessToken: string,
  input: CreateEventsubSubscriptionInput,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchEventsubSubscription> {
  const res = await fetch(`${apiBaseUrl}/helix/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${appAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: input.type,
      version: input.version,
      condition: { broadcaster_user_id: input.broadcasterUserId },
      transport: {
        method: "webhook",
        callback: input.callbackUrl,
        secret: input.secret,
      },
    }),
  })
  if (!res.ok)
    throw new TwitchApiError(`EventSub subscription create failed`, res.status)
  const body = (await res.json()) as { data: TwitchEventsubSubscription[] }
  const subscription = body.data[0]
  if (!subscription)
    throw new TwitchApiError("No subscription in Twitch response", 200)
  return subscription
}

export async function getAuthenticatedUser(
  clientId: string,
  accessToken: string,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchUser> {
  const res = await fetch(`${apiBaseUrl}/helix/users`, {
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
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchFollowedChannel[]> {
  const results: TwitchFollowedChannel[] = []
  let cursor: string | undefined

  do {
    const url = new URL(`${apiBaseUrl}/helix/channels/followed`)
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

export async function searchCategories(
  clientId: string,
  accessToken: string,
  query: string,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchCategory[]> {
  const url = new URL(`${apiBaseUrl}/helix/search/categories`)
  url.searchParams.set("query", query)
  url.searchParams.set("first", "20")

  const res = await fetch(url.toString(), {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  // Twitch returns 404 for queries with no matching categories.
  if (res.status === 404) return []
  if (!res.ok) throw new TwitchApiError(`Category search failed`, res.status)
  const body = (await res.json()) as { data?: TwitchCategory[] }
  return body.data ?? []
}

export async function getStreamsByUserIds(
  clientId: string,
  accessToken: string,
  userIds: string[],
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchStream[]> {
  // Get Streams accepts at most 100 user_id params per request.
  const BATCH_SIZE = 100
  const results: TwitchStream[] = []

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const url = new URL(`${apiBaseUrl}/helix/streams`)
    for (const userId of userIds.slice(i, i + BATCH_SIZE)) {
      url.searchParams.append("user_id", userId)
    }
    url.searchParams.set("first", "100")

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) throw new TwitchApiError(`Streams fetch failed`, res.status)
    const body = (await res.json()) as { data: TwitchStream[] }
    results.push(...body.data)
  }

  return results
}

export async function getAllFollowedStreams(
  clientId: string,
  accessToken: string,
  userId: string,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchFollowedStream[]> {
  const results: TwitchFollowedStream[] = []
  let cursor: string | undefined

  do {
    const url = new URL(`${apiBaseUrl}/helix/streams/followed`)
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
