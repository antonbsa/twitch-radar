import type { Database } from "../../db"
import type { AppConfig } from "../../env"
import { logger, serializeError } from "../../lib/logger"
import { getCategoriesByIds } from "../../services/twitch/categories"
import { getValidAccessToken } from "../../services/twitch/token-refresh"

/**
 * Box art template URL per category id (ADR 0058). Cached ids come from D1;
 * the rest are fetched in one Get Games call and stored, an id Twitch doesn't
 * return as null so it isn't asked again. A Twitch failure is logged and
 * leaves those ids out of the map (callers treat absent as null) instead of
 * failing the response, and they are retried on the next read.
 */
export async function resolveBoxArt(
  db: Database,
  config: AppConfig,
  userId: string,
  categoryIds: Iterable<string | null>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set([...categoryIds].filter((id) => id !== null))]
  if (ids.length === 0) return new Map()

  const boxArt = await db.categoryBoxArt.findByIds(ids)
  const missing = ids.filter((id) => !boxArt.has(id))
  if (missing.length === 0) return boxArt

  try {
    const accessToken = await getValidAccessToken(db, config, userId)
    const fetched = await getCategoriesByIds(
      config.twitchClientId,
      accessToken,
      missing,
      config.twitchApiBaseUrl,
    )
    const urlById = new Map(fetched.map((c) => [c.id, c.box_art_url ?? null]))
    const entries = missing.map((id) => ({
      id,
      box_art_url: urlById.get(id) ?? null,
    }))
    await db.categoryBoxArt.upsertMany(entries, new Date().toISOString())
    for (const entry of entries) boxArt.set(entry.id, entry.box_art_url)
  } catch (err) {
    logger.warn("Category box art lookup failed", {
      missingCount: missing.length,
      ...serializeError(err),
    })
  }
  return boxArt
}
