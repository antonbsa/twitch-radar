import type { Database } from "../../db"
import type { AppConfig } from "../../env"
import { logger, serializeError } from "../../lib/logger"
import { getCategoriesByIds } from "../../services/twitch/categories"
import { getAppAccessToken } from "../../services/twitch/app-token"

// Twitch rarely swaps a category's art, but a null cached while its art wasn't ready would otherwise stick forever (ADR 0058).
const BOX_ART_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Box art template URL per category id (ADR 0058). Ids cached within the TTL come from D1; the rest (never cached or expired) are fetched in one Get Games call and stored, an id Twitch doesn't return as null so it isn't asked again until it expires. The call uses the app token: a user token that Twitch rejects would flag the user's session as needing a reconnect over a purely decorative lookup. A Twitch failure is logged instead of failing the response: expired ids keep their stale value, never-cached ids are left out of the map (callers treat absent as null), and both are retried on the next read.
 */
export async function resolveBoxArt(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  categoryIds: Iterable<string | null>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set([...categoryIds].filter((id) => id !== null))]
  if (ids.length === 0) return new Map()

  const cached = await db.categoryBoxArt.findByIds(ids)
  const boxArt = new Map<string, string | null>()
  const cutoff = Date.now() - BOX_ART_TTL_MS
  const missing: string[] = []
  for (const id of ids) {
    const entry = cached.get(id)
    if (entry) boxArt.set(id, entry.box_art_url)
    if (!entry || new Date(entry.updated_at).getTime() < cutoff) {
      missing.push(id)
    }
  }
  if (missing.length === 0) return boxArt

  try {
    const fetched = await getCategoriesByIds(
      config.twitchClientId,
      await getAppAccessToken(kv, config),
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
