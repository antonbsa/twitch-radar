import { and, eq, inArray, lte } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { notificationSnoozes } from "../schema"

// Lifecycle: pending -> fired | expired (ADR 0048). A snooze that fires
// re-sends through the normal delivery pipeline; one that expires found the
// channel no longer in the desired category (or offline) at fire time.
export type NotificationSnoozeStatus = "pending" | "fired" | "expired"

export interface InsertNotificationSnoozeInput {
  userId: string
  broadcasterUserId: string
  categoryId: string
  fireAt: string
  now: string
}

export interface NotificationSnoozeRecord {
  id: string
  user_id: string
  broadcaster_user_id: string
  category_id: string
  fire_at: string
  status: string
  created_at: string
}

function toRecord(
  row: typeof notificationSnoozes.$inferSelect,
): NotificationSnoozeRecord {
  return {
    id: row.id,
    user_id: row.userId,
    broadcaster_user_id: row.broadcasterUserId,
    category_id: row.categoryId,
    fire_at: row.fireAt,
    status: row.status,
    created_at: row.createdAt,
  }
}

export class NotificationSnoozesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(
    input: InsertNotificationSnoozeInput,
  ): Promise<NotificationSnoozeRecord> {
    const row = {
      id: `nsnz_${nanoid()}`,
      userId: input.userId,
      broadcasterUserId: input.broadcasterUserId,
      categoryId: input.categoryId,
      fireAt: input.fireAt,
      status: "pending" as const,
      createdAt: input.now,
    }
    await this.db.insert(notificationSnoozes).values(row).run()
    return toRecord(row)
  }

  /**
   * The `pending` reminder already scheduled for this user/broadcaster/
   * category, if any — the snooze endpoint uses this to make a repeated
   * request idempotent instead of stacking reminders (ADR 0048).
   */
  async findPendingByUserBroadcasterCategory(
    userId: string,
    broadcasterUserId: string,
    categoryId: string,
  ): Promise<NotificationSnoozeRecord | null> {
    const row = await this.db
      .select()
      .from(notificationSnoozes)
      .where(
        and(
          eq(notificationSnoozes.userId, userId),
          eq(notificationSnoozes.broadcasterUserId, broadcasterUserId),
          eq(notificationSnoozes.categoryId, categoryId),
          eq(notificationSnoozes.status, "pending"),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  /** Rows due for the sweep: still pending and past their fire time. */
  async findDue(
    now: string,
    limit: number,
  ): Promise<NotificationSnoozeRecord[]> {
    const rows = await this.db
      .select()
      .from(notificationSnoozes)
      .where(
        and(
          eq(notificationSnoozes.status, "pending"),
          lte(notificationSnoozes.fireAt, now),
        ),
      )
      .limit(limit)
      .all()
    return rows.map(toRecord)
  }

  async markFired(id: string): Promise<void> {
    await this.db
      .update(notificationSnoozes)
      .set({ status: "fired" })
      .where(eq(notificationSnoozes.id, id))
      .run()
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .update(notificationSnoozes)
      .set({ status: "expired" })
      .where(eq(notificationSnoozes.id, id))
      .run()
  }

  async findByBroadcasterUserIds(
    ids: string[],
  ): Promise<NotificationSnoozeRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: NotificationSnoozeRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(notificationSnoozes)
        .where(
          inArray(
            notificationSnoozes.broadcasterUserId,
            ids.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }
}
