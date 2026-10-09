import { inArray, sql } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { categoryBoxArt } from "../schema"

export interface CategoryBoxArtEntry {
  id: string
  box_art_url: string | null
}

export interface CachedBoxArt {
  box_art_url: string | null
  updated_at: string
}

// D1 allows 100 bound parameters per query: reads bind one per id, upserts
// three per row (apps/api/AGENTS.md "D1 query limits").
const READ_BATCH_SIZE = 100
const UPSERT_BATCH_SIZE = 30

export class CategoryBoxArtRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /** Cached entries by category id; ids never cached are absent from the map. */
  async findByIds(ids: string[]): Promise<Map<string, CachedBoxArt>> {
    const found = new Map<string, CachedBoxArt>()
    for (let i = 0; i < ids.length; i += READ_BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(categoryBoxArt)
        .where(inArray(categoryBoxArt.id, ids.slice(i, i + READ_BATCH_SIZE)))
        .all()
      for (const row of rows) {
        found.set(row.id, {
          box_art_url: row.boxArtUrl,
          updated_at: row.updatedAt,
        })
      }
    }
    return found
  }

  async upsertMany(entries: CategoryBoxArtEntry[], now: string): Promise<void> {
    for (let i = 0; i < entries.length; i += UPSERT_BATCH_SIZE) {
      await this.db
        .insert(categoryBoxArt)
        .values(
          entries.slice(i, i + UPSERT_BATCH_SIZE).map((entry) => ({
            id: entry.id,
            boxArtUrl: entry.box_art_url,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: categoryBoxArt.id,
          set: {
            boxArtUrl: sql`excluded.box_art_url`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run()
    }
  }
}
