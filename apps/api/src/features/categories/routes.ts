import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../../http/errors"
import { jsonResponse } from "../../http/response"
import { searchCategories } from "../../services/twitch/categories"
import { withUserAccessToken } from "../../services/twitch/token-refresh"

export async function handleSearchCategories(
  c: Context<HonoEnv>,
): Promise<Response> {
  const query = c.req.query("q")?.trim()
  if (!query) {
    throw new ApiError(400, "invalid_request", "Missing search query")
  }

  const categories = await withUserAccessToken(
    c.var.db,
    c.var.config,
    c.var.userId,
    (token) =>
      searchCategories(
        c.var.config.twitchClientId,
        token,
        query,
        c.var.config.twitchApiBaseUrl,
      ),
  )

  // Seeds the box art cache so creating a preference from a result is a hit (ADR 0058).
  await c.var.db.categoryBoxArt.upsertMany(
    categories.map((category) => ({
      id: category.id,
      box_art_url: category.box_art_url ?? null,
    })),
    new Date().toISOString(),
  )

  return jsonResponse({
    data: categories.map((category) => ({
      id: category.id,
      name: category.name,
      box_art_url: category.box_art_url ?? null,
    })),
  })
}
