import { and, eq, inArray, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { notificationDeliveries } from "../schema"

// ADR 0008 trigger types for category notifications.
export type NotificationTriggerType =
  "stream_started_in_category" | "switched_into_category"

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
   * Inserts a `pending` delivery; the unique dedupe index on
   * (user, broadcaster, category, trigger, stream) makes a repeat of the
   * same user/event combination a no-op (ADR 0008). Returns the row that
   * owns the dedupe key — the fresh insert or the pre-existing one — so the
   * caller can decide whether a send job is still owed.
   */
  async insertPendingIfNew(
    input: InsertNotificationDeliveryInput,
  ): Promise<NotificationDeliveryRecord | null> {
    await this.db
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
      .onConflictDoNothing({
        target: [
          notificationDeliveries.userId,
          notificationDeliveries.broadcasterUserId,
          notificationDeliveries.categoryId,
          notificationDeliveries.triggerType,
          notificationDeliveries.streamId,
        ],
      })
      .run()

    const row = await this.db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.userId, input.userId),
          eq(notificationDeliveries.broadcasterUserId, input.broadcasterUserId),
          eq(notificationDeliveries.categoryId, input.categoryId),
          eq(notificationDeliveries.triggerType, input.triggerType),
          input.streamId === null
            ? isNull(notificationDeliveries.streamId)
            : eq(notificationDeliveries.streamId, input.streamId),
        ),
      )
      .get()
    return row ? toRecord(row) : null
  }

  async findById(id: string): Promise<NotificationDeliveryRecord | null> {
    const row = await this.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, id))
      .get()
    return row ? toRecord(row) : null
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
