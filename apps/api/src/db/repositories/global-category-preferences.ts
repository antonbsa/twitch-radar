import { and, eq, inArray, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { globalCategoryPreferences } from "../schema"

export interface CreateGlobalPreferenceInput {
  userId: string
  categoryId: string
  categoryName: string
  now: string
}

export interface GlobalPreferenceRecord {
  id: string
  user_id: string
  category_id: string
  category_name: string
  created_at: string
  disabled_at: string | null
}

function toRecord(
  row: typeof globalCategoryPreferences.$inferSelect,
): GlobalPreferenceRecord {
  return {
    id: row.id,
    user_id: row.userId,
    category_id: row.categoryId,
    category_name: row.categoryName,
    created_at: row.createdAt,
    disabled_at: row.disabledAt,
  }
}

export class GlobalCategoryPreferencesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(
    input: CreateGlobalPreferenceInput,
  ): Promise<GlobalPreferenceRecord> {
    const id = `gpref_${nanoid()}`
    await this.db
      .insert(globalCategoryPreferences)
      .values({
        id,
        userId: input.userId,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        createdAt: input.now,
      })
      .run()
    return {
      id,
      user_id: input.userId,
      category_id: input.categoryId,
      category_name: input.categoryName,
      created_at: input.now,
      disabled_at: null,
    }
  }

  /** Re-enables a soft-disabled preference (or refreshes the stored name). */
  async reactivate(id: string, categoryName: string): Promise<void> {
    await this.db
      .update(globalCategoryPreferences)
      .set({ categoryName, disabledAt: null })
      .where(eq(globalCategoryPreferences.id, id))
      .run()
  }

  async disable(id: string, now: string): Promise<void> {
    await this.db
      .update(globalCategoryPreferences)
      .set({ disabledAt: now })
      .where(eq(globalCategoryPreferences.id, id))
      .run()
  }

  async findById(id: string): Promise<GlobalPreferenceRecord | null> {
    const row = await this.db
      .select()
      .from(globalCategoryPreferences)
      .where(eq(globalCategoryPreferences.id, id))
      .get()
    return row ? toRecord(row) : null
  }

  async findByUserAndCategory(
    userId: string,
    categoryId: string,
  ): Promise<GlobalPreferenceRecord | null> {
    const row = await this.db
      .select()
      .from(globalCategoryPreferences)
      .where(
        and(
          eq(globalCategoryPreferences.userId, userId),
          eq(globalCategoryPreferences.categoryId, categoryId),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  async listActiveByUserId(userId: string): Promise<GlobalPreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(globalCategoryPreferences)
      .where(
        and(
          eq(globalCategoryPreferences.userId, userId),
          isNull(globalCategoryPreferences.disabledAt),
        ),
      )
      .all()
    return rows.map(toRecord)
  }

  /** Active preferences (all users) for one category. */
  async findActiveByCategoryId(
    categoryId: string,
  ): Promise<GlobalPreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(globalCategoryPreferences)
      .where(
        and(
          eq(globalCategoryPreferences.categoryId, categoryId),
          isNull(globalCategoryPreferences.disabledAt),
        ),
      )
      .all()
    return rows.map(toRecord)
  }

  /** Distinct users holding at least one active global preference. */
  async listUserIdsWithActive(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: globalCategoryPreferences.userId })
      .from(globalCategoryPreferences)
      .where(isNull(globalCategoryPreferences.disabledAt))
      .all()
    return rows.map((row) => row.userId)
  }

  async anyActiveForUsers(userIds: string[]): Promise<boolean> {
    if (userIds.length === 0) return false
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const row = await this.db
        .select({ id: globalCategoryPreferences.id })
        .from(globalCategoryPreferences)
        .where(
          and(
            inArray(
              globalCategoryPreferences.userId,
              userIds.slice(i, i + BATCH_SIZE),
            ),
            isNull(globalCategoryPreferences.disabledAt),
          ),
        )
        .limit(1)
        .get()
      if (row) return true
    }
    return false
  }
}
