import { and, eq, inArray, max } from "drizzle-orm"
import { nanoid } from "nanoid"
import { asBatch, type AppDatabase } from "../client"
import { notificationDeliveries } from "../schema"

// ADR 0008 trigger types for category notifications; snooze_reminder is a
// user-requested re-send of a snoozed delivery (ADR 0048), excluded from the
// dedupe index so it can repeat within a stream.
export type NotificationTriggerType =
  "stream_started_in_category" | "switched_into_category" | "snooze_reminder"

// Lifecycle: pending → sent | failed | skipped (ADR 0034).
export type NotificationDeliveryStatus =
  "pending" | "sent" | "failed" | "skipped"

export interface InsertNotificationDeliveryInput {
  userId: string
  broadcasterUserId: string
  categoryId: string
  triggerType: NotificationTriggerType
  eventsubMessageId: string | null
  streamId: string | null
  now: string
}

export interface NotificationDeliveryRecord {
  id: string
  user_id: string
  push_subscription_id: string | null
  broadcaster_user_id: string
  category_id: string
  trigger_type: string
  eventsub_message_id: string | null
  stream_id: string | null
  status: string
  error_message: string | null
  created_at: string
  sent_at: string | null
}

function toRecord(
  row: typeof notificationDeliveries.$inferSelect,
): NotificationDeliveryRecord {
  return {
    id: row.id,
    user_id: row.userId,
    push_subscription_id: row.pushSubscriptionId,
    broadcaster_user_id: row.broadcasterUserId,
    category_id: row.categoryId,
    trigger_type: row.triggerType,
    eventsub_message_id: row.eventsubMessageId,
    stream_id: row.streamId,
    status: row.status,
    error_message: row.errorMessage,
    created_at: row.createdAt,
    sent_at: row.sentAt,
  }
}

export class NotificationDeliveriesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Stages a `snooze_reminder` delivery with no dedupe: the dedupe index
   * excludes reminders so a stream can be snoozed and reminded repeatedly
   * (ADR 0048). The caller claims the snooze (`claimForFiring`) first; that
   * claim is the only replay guard.
   */
  async insertSnoozeReminder(
    input: Omit<InsertNotificationDeliveryInput, "triggerType">,
  ): Promise<NotificationDeliveryRecord> {
    const row = await this.db
      .insert(notificationDeliveries)
      .values({
        id: `ndel_${nanoid()}`,
        userId: input.userId,
        broadcasterUserId: input.broadcasterUserId,
        categoryId: input.categoryId,
        triggerType: "snooze_reminder",
        eventsubMessageId: input.eventsubMessageId,
        streamId: input.streamId,
        status: "pending",
        createdAt: input.now,
      })
      .returning()
      .get()
    return toRecord(row)
  }

  /** One user's `onConflictDoNothing` insert; `insertPendingForUsers` batches them. */
  private pendingInsert(input: InsertNotificationDeliveryInput) {
    return (
      this.db
        .insert(notificationDeliveries)
        .values({
          id: `ndel_${nanoid()}`,
          userId: input.userId,
          broadcasterUserId: input.broadcasterUserId,
          categoryId: input.categoryId,
          triggerType: input.triggerType,
          eventsubMessageId: input.eventsubMessageId,
          streamId: input.streamId,
          status: "pending",
          createdAt: input.now,
        })
        // No target: SQLite requires a partial index's WHERE in the conflict
        // target and drizzle's DoNothing can't emit one. The dedupe index is
        // the only unique constraint besides the nanoid primary key.
        .onConflictDoNothing()
    )
  }

  /**
   * Inserts a `pending` delivery per user of one event; the unique dedupe
   * index on (user, broadcaster, category, trigger, stream) makes a repeat a
   * no-op (ADR 0008). Constant D1 queries (one `batch()` of inserts, then
   * chunked selects) keep a large audience under the Free plan's 50 queries
   * per invocation. Returns the row owning each user's dedupe key, fresh or
   * pre-existing, so the caller can tell whether a send job is still owed.
   */
  async insertPendingForUsers(
    userIds: string[],
    input: Omit<InsertNotificationDeliveryInput, "userId">,
  ): Promise<NotificationDeliveryRecord[]> {
    if (userIds.length === 0) return []
    const { streamId } = input
    // SQLite treats NULLs in a unique index as distinct, so a null stream_id
    // would bypass dedupe; fail loudly instead.
    if (streamId === null) {
      throw new Error(
        `insertPendingForUsers: streamId is required to guarantee dedupe (would ` +
          `use key broadcasterUserId=${input.broadcasterUserId}, ` +
          `categoryId=${input.categoryId}, triggerType=${input.triggerType})`,
      )
    }

    await this.db.batch(
      asBatch(
        userIds.map((userId) => this.pendingInsert({ ...input, userId })),
      ),
    )

    // D1 limits bound parameters to 100 per query; 4 more are bound below.
    const BATCH_SIZE = 90
    const rows: NotificationDeliveryRecord[] = []
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const found = await this.db
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            inArray(
              notificationDeliveries.userId,
              userIds.slice(i, i + BATCH_SIZE),
            ),
            eq(
              notificationDeliveries.broadcasterUserId,
              input.broadcasterUserId,
            ),
            eq(notificationDeliveries.categoryId, input.categoryId),
            eq(notificationDeliveries.triggerType, input.triggerType),
            eq(notificationDeliveries.streamId, streamId),
          ),
        )
        .all()
      rows.push(...found.map(toRecord))
    }
    return rows
  }

  async findById(id: string): Promise<NotificationDeliveryRecord | null> {
    const row = await this.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, id))
      .get()
    return row ? toRecord(row) : null
  }

  /**
   * Latest `sent_at` per user for the broadcaster, whatever the category,
   * trigger or stream: the send-side cooldown deliberately ignores them
   * (ADR 0056). Users never sent to are absent from the map.
   */
  async findLastSentAtByUsers(
    broadcasterUserId: string,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const lastSentAt = new Map<string, string>()
    // D1 limits bound parameters to 100 per query; 2 more are bound below.
    const BATCH_SIZE = 90
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select({
          userId: notificationDeliveries.userId,
          sentAt: max(notificationDeliveries.sentAt),
        })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.broadcasterUserId, broadcasterUserId),
            eq(notificationDeliveries.status, "sent"),
            inArray(
              notificationDeliveries.userId,
              userIds.slice(i, i + BATCH_SIZE),
            ),
          ),
        )
        .groupBy(notificationDeliveries.userId)
        .all()
      for (const row of rows) {
        if (row.sentAt) lastSentAt.set(row.userId, row.sentAt)
      }
    }
    return lastSentAt
  }

  async markSent(
    id: string,
    pushSubscriptionId: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(notificationDeliveries)
      .set({ status: "sent", pushSubscriptionId, sentAt: now })
      .where(eq(notificationDeliveries.id, id))
      .run()
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db
      .update(notificationDeliveries)
      .set({ status: "failed", errorMessage })
      .where(eq(notificationDeliveries.id, id))
      .run()
  }

  /** A delivery that matched but had nowhere to go (no active devices). */
  async markSkipped(id: string, reason: string): Promise<void> {
    await this.db
      .update(notificationDeliveries)
      .set({ status: "skipped", errorMessage: reason })
      .where(eq(notificationDeliveries.id, id))
      .run()
  }

  async findByBroadcasterUserIds(
    ids: string[],
  ): Promise<NotificationDeliveryRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: NotificationDeliveryRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(notificationDeliveries)
        .where(
          inArray(
            notificationDeliveries.broadcasterUserId,
            ids.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }
}
