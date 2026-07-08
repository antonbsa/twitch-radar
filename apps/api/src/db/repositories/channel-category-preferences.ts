import { and, eq, isNull } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { channelCategoryPreferences } from "../schema"

export interface CreateChannelPreferenceInput {
  id: string
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

  async create(input: CreateChannelPreferenceInput): Promise<void> {
    await this.db
      .insert(channelCategoryPreferences)
      .values({
        id: input.id,
        userId: input.userId,
        broadcasterUserId: input.broadcasterUserId,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        createdAt: input.now,
      })
      .run()
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

  async anyActiveForBroadcaster(broadcasterUserId: string): Promise<boolean> {
    const row = await this.db
      .select({ id: channelCategoryPreferences.id })
      .from(channelCategoryPreferences)
      .where(
        and(
          eq(channelCategoryPreferences.broadcasterUserId, broadcasterUserId),
          isNull(channelCategoryPreferences.disabledAt),
        ),
      )
      .limit(1)
      .get()
    return row !== undefined
  }
}
