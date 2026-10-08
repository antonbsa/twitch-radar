import { TwitchApiError, readErrorBody } from "./errors"

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
    throw new TwitchApiError(
      `Category search failed`,
      res.status,
      await readErrorBody(res),
    )
  const body = (await res.json()) as { data?: TwitchCategory[] }
  return body.data ?? []
}

/** Get Games; unknown ids are just absent from the result. */
export async function getCategoriesByIds(
  clientId: string,
  accessToken: string,
  ids: string[],
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchCategory[]> {
  // Get Games accepts at most 100 id params per request.
  const BATCH_SIZE = 100
  const results: TwitchCategory[] = []

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const url = new URL(`${apiBaseUrl}/helix/games`)
    for (const id of ids.slice(i, i + BATCH_SIZE)) {
      url.searchParams.append("id", id)
    }

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok)
      throw new TwitchApiError(
        `Categories fetch failed`,
        res.status,
        await readErrorBody(res),
      )
    const body = (await res.json()) as { data?: TwitchCategory[] }
    results.push(...(body.data ?? []))
  }

  return results
}
