import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"
import { searchCategories } from "../../services/twitch/client"
import { getValidAccessToken } from "../../services/twitch/token-refresh"

export async function handleSearchCategories(
  c: Context<HonoEnv>,
): Promise<Response> {
  const query = c.req.query("q")?.trim()
  if (!query) {
    throw new ApiError(400, "invalid_request", "Missing search query")
  }

  const accessToken = await getValidAccessToken(
    c.var.db,
    c.var.config,
    c.var.userId,
  )
  const categories = await searchCategories(
    c.var.config.twitchClientId,
    accessToken,
    query,
    c.var.config.twitchApiBaseUrl,
  )

  return jsonResponse({
    data: categories.map((category) => ({
      id: category.id,
      name: category.name,
      box_art_url: category.box_art_url ?? null,
    })),
  })
}
