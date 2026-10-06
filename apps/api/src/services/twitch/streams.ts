import { TwitchApiError, readErrorBody } from "./errors"

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
  thumbnail_url: string
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
  thumbnail_url: string
}

/**
 * Twitch's stream thumbnail URLs are templates with literal {width}/{height}
 * placeholders (e.g. ".../live_user_foo-{width}x{height}.jpg") that callers
 * must substitute before the URL is usable.
 *
 * @param width Pixels.
 * @param height Pixels.
 * @returns `null` when there's no template.
 */
export function resolveThumbnailUrl(
  template: string | null | undefined,
  width = 640,
  height = 360,
): string | null {
  if (!template) return null
  return template
    .replace("{width}", String(width))
    .replace("{height}", String(height))
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
    if (!res.ok)
      throw new TwitchApiError(
        `Streams fetch failed`,
        res.status,
        await readErrorBody(res),
      )
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
      throw new TwitchApiError(
        `Followed streams fetch failed`,
        res.status,
        await readErrorBody(res),
      )
    const body = (await res.json()) as {
      data: TwitchFollowedStream[]
      pagination?: { cursor?: string }
    }
    results.push(...body.data)
    cursor = body.pagination?.cursor
  } while (cursor)

  return results
}
