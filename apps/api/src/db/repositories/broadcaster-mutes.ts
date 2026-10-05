import { and, eq, inArray, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { broadcasterMutes } from "../schema"

export interface BroadcasterMuteRecord {
  id: string
  user_id: string
  broadcaster_user_id: string
  created_at: string
  disabled_at: string | null
}

function toRecord(
  row: typeof broadcasterMutes.$inferSelect,
): BroadcasterMuteRecord {
  return {
    id: row.id,
    user_id: row.userId,
    broadcaster_user_id: row.broadcasterUserId,
    created_at: row.createdAt,
    disabled_at: row.disabledAt,
  }
}

export class BroadcasterMutesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(input: {
    userId: string
    broadcasterUserId: string
    now: string
  }): Promise<BroadcasterMuteRecord> {
    const row = {
      id: `bmute_${nanoid()}`,
      userId: input.userId,
      broadcasterUserId: input.broadcasterUserId,
      createdAt: input.now,
      disabledAt: null,
    }
    await this.db.insert(broadcasterMutes).values(row).run()
    return toRecord(row)
  }

  async findById(id: string): Promise<BroadcasterMuteRecord | null> {
    const row = await this.db
      .select()
      .from(broadcasterMutes)
      .where(eq(broadcasterMutes.id, id))
      .get()
    return row ? toRecord(row) : null
  }

  async findByUserAndBroadcaster(
    userId: string,
    broadcasterUserId: string,
  ): Promise<BroadcasterMuteRecord | null> {
    const row = await this.db
      .select()
      .from(broadcasterMutes)
      .where(
        and(
          eq(broadcasterMutes.userId, userId),
          eq(broadcasterMutes.broadcasterUserId, broadcasterUserId),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  async reactivate(id: string): Promise<void> {
    await this.db
      .update(broadcasterMutes)
      .set({ disabledAt: null })
      .where(eq(broadcasterMutes.id, id))
      .run()
  }

  async disable(id: string, now: string): Promise<void> {
    await this.db
      .update(broadcasterMutes)
      .set({ disabledAt: now })
      .where(eq(broadcasterMutes.id, id))
      .run()
  }

  async listActiveByUserId(userId: string): Promise<BroadcasterMuteRecord[]> {
    const rows = await this.db
      .select()
      .from(broadcasterMutes)
      .where(
        and(
          eq(broadcasterMutes.userId, userId),
          isNull(broadcasterMutes.disabledAt),
        ),
      )
      .all()
    return rows.map(toRecord)
  }

  /** Subset of the given users with an active mute for the broadcaster. */
  async findMutedUserIds(
    broadcasterUserId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    const result = new Set<string>()
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 99
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select({ userId: broadcasterMutes.userId })
        .from(broadcasterMutes)
        .where(
          and(
            eq(broadcasterMutes.broadcasterUserId, broadcasterUserId),
            inArray(broadcasterMutes.userId, userIds.slice(i, i + BATCH_SIZE)),
            isNull(broadcasterMutes.disabledAt),
          ),
        )
        .all()
      for (const row of rows) result.add(row.userId)
    }
    return result
  }
}
