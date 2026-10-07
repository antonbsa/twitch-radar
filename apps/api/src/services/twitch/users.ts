import { TwitchApiError, twitchApiErrorFromResponse } from "./errors"

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
  if (!res.ok)
    throw await twitchApiErrorFromResponse(`User profile fetch failed`, res)
  const body = (await res.json()) as { data: TwitchUser[] }
  const user = body.data[0]
  if (!user) throw new TwitchApiError("No user in Twitch response", 200, "")
  return user
}

/** Works with a user or an app access token; unknown ids are just absent from the result. */
export async function getUsersByIds(
  clientId: string,
  accessToken: string,
  userIds: string[],
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchUser[]> {
  // Get Users accepts at most 100 id params per request.
  const BATCH_SIZE = 100
  const results: TwitchUser[] = []

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const url = new URL(`${apiBaseUrl}/helix/users`)
    for (const userId of userIds.slice(i, i + BATCH_SIZE)) {
      url.searchParams.append("id", userId)
    }

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok)
      throw await twitchApiErrorFromResponse(`Users fetch failed`, res)
    const body = (await res.json()) as { data: TwitchUser[] }
    results.push(...body.data)
  }

  return results
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
      throw await twitchApiErrorFromResponse(
        `Followed channels fetch failed`,
        res,
      )
    const body = (await res.json()) as {
      data: TwitchFollowedChannel[]
      pagination?: { cursor?: string }
    }
    results.push(...body.data)
    cursor = body.pagination?.cursor
  } while (cursor)

  return results
}
