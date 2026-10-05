import { and, eq, inArray, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { globalCategoryPreferenceExclusions } from "../schema"

export interface GlobalPreferenceExclusionRecord {
  id: string
  preference_id: string
  broadcaster_user_id: string
  created_at: string
  disabled_at: string | null
}

function toRecord(
  row: typeof globalCategoryPreferenceExclusions.$inferSelect,
): GlobalPreferenceExclusionRecord {
  return {
    id: row.id,
    preference_id: row.preferenceId,
    broadcaster_user_id: row.broadcasterUserId,
    created_at: row.createdAt,
    disabled_at: row.disabledAt,
  }
}

// D1 limits bound parameters to 100 per query; batch to stay within that.
const BATCH_SIZE = 99

export class GlobalCategoryPreferenceExclusionsRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(input: {
    preferenceId: string
    broadcasterUserId: string
    now: string
  }): Promise<GlobalPreferenceExclusionRecord> {
    const row = {
      id: `gprex_${nanoid()}`,
      preferenceId: input.preferenceId,
      broadcasterUserId: input.broadcasterUserId,
      createdAt: input.now,
      disabledAt: null,
    }
    await this.db.insert(globalCategoryPreferenceExclusions).values(row).run()
    return toRecord(row)
  }

  async findById(id: string): Promise<GlobalPreferenceExclusionRecord | null> {
    const row = await this.db
      .select()
      .from(globalCategoryPreferenceExclusions)
      .where(eq(globalCategoryPreferenceExclusions.id, id))
      .get()
    return row ? toRecord(row) : null
  }

  async findByPreferenceAndBroadcaster(
    preferenceId: string,
    broadcasterUserId: string,
  ): Promise<GlobalPreferenceExclusionRecord | null> {
    const row = await this.db
      .select()
      .from(globalCategoryPreferenceExclusions)
      .where(
        and(
          eq(globalCategoryPreferenceExclusions.preferenceId, preferenceId),
          eq(
            globalCategoryPreferenceExclusions.broadcasterUserId,
            broadcasterUserId,
          ),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  async reactivate(id: string): Promise<void> {
    await this.db
      .update(globalCategoryPreferenceExclusions)
      .set({ disabledAt: null })
      .where(eq(globalCategoryPreferenceExclusions.id, id))
      .run()
  }

  async disable(id: string, now: string): Promise<void> {
    await this.db
      .update(globalCategoryPreferenceExclusions)
      .set({ disabledAt: now })
      .where(eq(globalCategoryPreferenceExclusions.id, id))
      .run()
  }

  /** Active exclusions for the given preferences, across all of them. */
  async listActiveByPreferenceIds(
    preferenceIds: string[],
  ): Promise<GlobalPreferenceExclusionRecord[]> {
    const results: GlobalPreferenceExclusionRecord[] = []
    for (let i = 0; i < preferenceIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(globalCategoryPreferenceExclusions)
        .where(
          and(
            inArray(
              globalCategoryPreferenceExclusions.preferenceId,
              preferenceIds.slice(i, i + BATCH_SIZE),
            ),
            isNull(globalCategoryPreferenceExclusions.disabledAt),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }

  /** Subset of the given preferences that actively exclude the broadcaster. */
  async findExcludingPreferenceIds(
    broadcasterUserId: string,
    preferenceIds: string[],
  ): Promise<Set<string>> {
    const result = new Set<string>()
    for (let i = 0; i < preferenceIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select({ id: globalCategoryPreferenceExclusions.preferenceId })
        .from(globalCategoryPreferenceExclusions)
        .where(
          and(
            eq(
              globalCategoryPreferenceExclusions.broadcasterUserId,
              broadcasterUserId,
            ),
            inArray(
              globalCategoryPreferenceExclusions.preferenceId,
              preferenceIds.slice(i, i + BATCH_SIZE),
            ),
            isNull(globalCategoryPreferenceExclusions.disabledAt),
          ),
        )
        .all()
      for (const row of rows) result.add(row.id)
    }
    return result
  }
}
