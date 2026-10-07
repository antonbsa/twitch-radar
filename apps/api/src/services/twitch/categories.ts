import { twitchApiErrorFromResponse } from "./errors"

export interface TwitchCategory {
  id: string
  name: string
  box_art_url: string | null
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
  if (!res.ok)
    throw await twitchApiErrorFromResponse(`Category search failed`, res)
  const body = (await res.json()) as { data?: TwitchCategory[] }
  return body.data ?? []
}
