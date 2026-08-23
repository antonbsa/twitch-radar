import { and, eq, inArray, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { channelCategoryPreferences } from "../schema"

export interface CreateChannelPreferenceInput {
  userId: string
  broadcasterUserId: string
  categoryId: string
  categoryName: string
  now: string
}

export interface ChannelPreferenceRecord {
  id: string
  user_id: string
  broadcaster_user_id: string
  category_id: string
  category_name: string
  created_at: string
  disabled_at: string | null
}

function toRecord(
  row: typeof channelCategoryPreferences.$inferSelect,
): ChannelPreferenceRecord {
  return {
    id: row.id,
    user_id: row.userId,
    broadcaster_user_id: row.broadcasterUserId,
    category_id: row.categoryId,
    category_name: row.categoryName,
    created_at: row.createdAt,
    disabled_at: row.disabledAt,
  }
}

export class ChannelCategoryPreferencesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(input: CreateChannelPreferenceInput): Promise<string> {
    const id = `cpref_${nanoid()}`
    await this.db
      .insert(channelCategoryPreferences)
      .values({
        id,
        userId: input.userId,
        broadcasterUserId: input.broadcasterUserId,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        createdAt: input.now,
      })
      .run()
    return id
  }

  /** Re-enables a soft-disabled preference (or refreshes the stored name). */
  async reactivate(id: string, categoryName: string): Promise<void> {
    await this.db
      .update(channelCategoryPreferences)
      .set({ categoryName, disabledAt: null })
      .where(eq(channelCategoryPreferences.id, id))
      .run()
  }

  async disable(id: string, now: string): Promise<void> {
    await this.db
      .update(channelCategoryPreferences)
      .set({ disabledAt: now })
      .where(eq(channelCategoryPreferences.id, id))
      .run()
  }

  async findById(id: string): Promise<ChannelPreferenceRecord | null> {
    const row = await this.db
      .select()
      .from(channelCategoryPreferences)
      .where(eq(channelCategoryPreferences.id, id))
      .get()
    return row ? toRecord(row) : null
  }

  async findByUserBroadcasterCategory(
    userId: string,
    broadcasterUserId: string,
    categoryId: string,
  ): Promise<ChannelPreferenceRecord | null> {
    const row = await this.db
      .select()
      .from(channelCategoryPreferences)
      .where(
        and(
          eq(channelCategoryPreferences.userId, userId),
          eq(channelCategoryPreferences.broadcasterUserId, broadcasterUserId),
          eq(channelCategoryPreferences.categoryId, categoryId),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  async listActiveByUserId(userId: string): Promise<ChannelPreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(channelCategoryPreferences)
      .where(
        and(
          eq(channelCategoryPreferences.userId, userId),
          isNull(channelCategoryPreferences.disabledAt),
        ),
      )
      .all()
    return rows.map(toRecord)
  }

  /** Active preferences (all users) matching one broadcaster+category pair. */
  async findActiveByBroadcasterAndCategory(
    broadcasterUserId: string,
    categoryId: string,
  ): Promise<ChannelPreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(channelCategoryPreferences)
      .where(
        and(
          eq(channelCategoryPreferences.broadcasterUserId, broadcasterUserId),
          eq(channelCategoryPreferences.categoryId, categoryId),
          isNull(channelCategoryPreferences.disabledAt),
        ),
      )
      .all()
    return rows.map(toRecord)
  }

  /** Subset of the given broadcasters with at least one active preference (any user). */
  async listBroadcastersWithActive(
    broadcasterUserIds: string[],
  ): Promise<Set<string>> {
    if (broadcasterUserIds.length === 0) return new Set()
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const result = new Set<string>()
    for (let i = 0; i < broadcasterUserIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .selectDistinct({
          broadcasterUserId: channelCategoryPreferences.broadcasterUserId,
        })
        .from(channelCategoryPreferences)
        .where(
          and(
            inArray(
              channelCategoryPreferences.broadcasterUserId,
              broadcasterUserIds.slice(i, i + BATCH_SIZE),
            ),
            isNull(channelCategoryPreferences.disabledAt),
          ),
        )
        .all()
      for (const row of rows) result.add(row.broadcasterUserId)
    }
    return result
  }
}
