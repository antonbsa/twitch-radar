import { eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { channelStateChanges } from "../schema"

export type ChannelStateChangeType =
  "stream_started" | "stream_ended" | "category_changed"

export interface InsertChannelStateChangeInput {
  broadcasterUserId: string
  eventsubMessageId: string
  changeType: ChannelStateChangeType
  previousIsLive: boolean | null
  nextIsLive: boolean | null
  previousCategoryId: string | null
  previousCategoryName: string | null
  nextCategoryId: string | null
  nextCategoryName: string | null
  streamId: string | null
  occurredAt: string
  now: string
}

export interface ChannelStateChangeRecord {
  id: string
  broadcaster_user_id: string
  eventsub_message_id: string
  change_type: string
  previous_is_live: boolean | null
  next_is_live: boolean | null
  previous_category_id: string | null
  previous_category_name: string | null
  next_category_id: string | null
  next_category_name: string | null
  stream_id: string | null
  occurred_at: string
  created_at: string
}

function toRecord(
  row: typeof channelStateChanges.$inferSelect,
): ChannelStateChangeRecord {
  return {
    id: row.id,
    broadcaster_user_id: row.broadcasterUserId,
    eventsub_message_id: row.eventsubMessageId,
    change_type: row.changeType,
    previous_is_live:
      row.previousIsLive === null ? null : row.previousIsLive === 1,
    next_is_live: row.nextIsLive === null ? null : row.nextIsLive === 1,
    previous_category_id: row.previousCategoryId,
    previous_category_name: row.previousCategoryName,
    next_category_id: row.nextCategoryId,
    next_category_name: row.nextCategoryName,
    stream_id: row.streamId,
    occurred_at: row.occurredAt,
    created_at: row.createdAt,
  }
}

export class ChannelStateChangesRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Inserts a transition record; a duplicate EventSub message id no-ops via
   * the unique index, which is the hard idempotency guarantee (ADR 0033).
   */
  async insertIfNew(input: InsertChannelStateChangeInput): Promise<void> {
    await this.db
      .insert(channelStateChanges)
      .values({
        id: `csc_${nanoid()}`,
        broadcasterUserId: input.broadcasterUserId,
        eventsubMessageId: input.eventsubMessageId,
        changeType: input.changeType,
        previousIsLive:
          input.previousIsLive === null ? null : input.previousIsLive ? 1 : 0,
        nextIsLive: input.nextIsLive === null ? null : input.nextIsLive ? 1 : 0,
        previousCategoryId: input.previousCategoryId,
        previousCategoryName: input.previousCategoryName,
        nextCategoryId: input.nextCategoryId,
        nextCategoryName: input.nextCategoryName,
        streamId: input.streamId,
        occurredAt: input.occurredAt,
        createdAt: input.now,
      })
      .onConflictDoNothing({ target: channelStateChanges.eventsubMessageId })
      .run()
  }

  async existsByEventsubMessageId(messageId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: channelStateChanges.id })
      .from(channelStateChanges)
      .where(eq(channelStateChanges.eventsubMessageId, messageId))
      .limit(1)
      .all()
    return rows.length > 0
  }

  async findByBroadcasterUserIds(
    ids: string[],
  ): Promise<ChannelStateChangeRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: ChannelStateChangeRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(channelStateChanges)
        .where(
          inArray(
            channelStateChanges.broadcasterUserId,
            ids.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }
}
