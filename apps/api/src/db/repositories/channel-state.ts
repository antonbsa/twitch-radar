import { inArray, sql } from "drizzle-orm"
import { asBatch, type AppDatabase } from "../client"
import { channelState } from "../schema"

export interface UpsertChannelStateInput {
  broadcasterUserId: string
  isLive: boolean
  streamId?: string | null
  categoryId?: string | null
  categoryName?: string | null
  title?: string | null
  thumbnailUrl?: string | null
  viewerCount?: number | null
  startedAt?: string | null
  categoryStartedAt?: string | null
  streamType?: string | null
  lastLiveAt?: string | null
  lastCategoryId?: string | null
  lastCategoryName?: string | null
  updatedFromEventAt?: string | null
  now: string
}

export interface ChannelStateRecord {
  broadcaster_user_id: string
  is_live: boolean
  stream_id: string | null
  category_id: string | null
  category_name: string | null
  title: string | null
  thumbnail_url: string | null
  viewer_count: number | null
  started_at: string | null
  category_started_at: string | null
  stream_type: string | null
  last_live_at: string | null
  last_category_id: string | null
  last_category_name: string | null
  updated_from_event_at: string | null
  updated_at: string
}

/**
 * Raw row access. Only the Channel State module and the test seam write
 * through `upsertAll`; every field rule lives in the module's `transition`.
 */
export class ChannelStateRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /** Replaces the whole row of each broadcaster; no field is merged with the stored one. */
  async upsertAll(inputs: UpsertChannelStateInput[]): Promise<void> {
    await this.write(inputs, false)
  }

  /**
   * Like `upsertAll`, but a row an Event wrote after the caller read it is
   * skipped (compare-and-set on `updated_from_event_at`), so a deferred
   * Snapshot never overwrites a newer Event. Relies on a Snapshot carrying
   * `updated_from_event_at` over unchanged from the row it read (ADR 0033).
   */
  async upsertSnapshotRows(inputs: UpsertChannelStateInput[]): Promise<void> {
    await this.write(inputs, true)
  }

  private async write(
    inputs: UpsertChannelStateInput[],
    skipIfEventSinceRead: boolean,
  ): Promise<void> {
    if (inputs.length === 0) return
    // 16 bound params per row (broadcasterUserId, isLive, streamId,
    // categoryId, categoryName, title, thumbnailUrl, viewerCount, startedAt,
    // categoryStartedAt, streamType, lastLiveAt, lastCategoryId,
    // lastCategoryName, updatedFromEventAt, updatedAt); D1 caps bound params
    // at 100 per query, so 6 rows/batch (96 params) stays under that limit.
    const BATCH_SIZE = 6
    const statements = []
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE)
      statements.push(
        this.db
          .insert(channelState)
          .values(
            batch.map((input) => ({
              broadcasterUserId: input.broadcasterUserId,
              isLive: input.isLive ? 1 : 0,
              streamId: input.streamId ?? null,
              categoryId: input.categoryId ?? null,
              categoryName: input.categoryName ?? null,
              title: input.title ?? null,
              thumbnailUrl: input.thumbnailUrl ?? null,
              viewerCount: input.viewerCount ?? null,
              startedAt: input.startedAt ?? null,
              categoryStartedAt: input.categoryStartedAt ?? null,
              streamType: input.streamType ?? null,
              lastLiveAt: input.lastLiveAt ?? null,
              lastCategoryId: input.lastCategoryId ?? null,
              lastCategoryName: input.lastCategoryName ?? null,
              updatedFromEventAt: input.updatedFromEventAt ?? null,
              updatedAt: input.now,
            })),
          )
          .onConflictDoUpdate({
            target: channelState.broadcasterUserId,
            // IS, not =: the stored value is NULL until the first Event.
            setWhere: skipIfEventSinceRead
              ? sql`${channelState.updatedFromEventAt} IS excluded.updated_from_event_at`
              : undefined,
            set: {
              isLive: sql`excluded.is_live`,
              streamId: sql`excluded.stream_id`,
              categoryId: sql`excluded.category_id`,
              categoryName: sql`excluded.category_name`,
              title: sql`excluded.title`,
              thumbnailUrl: sql`excluded.thumbnail_url`,
              viewerCount: sql`excluded.viewer_count`,
              startedAt: sql`excluded.started_at`,
              categoryStartedAt: sql`excluded.category_started_at`,
              streamType: sql`excluded.stream_type`,
              lastLiveAt: sql`excluded.last_live_at`,
              lastCategoryId: sql`excluded.last_category_id`,
              lastCategoryName: sql`excluded.last_category_name`,
              updatedFromEventAt: sql`excluded.updated_from_event_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          }),
      )
    }
    // Single D1 round trip for every chunk instead of one await per chunk —
    // see the batch()-limits note in followed-channels.ts's upsertAll.
    await this.db.batch(asBatch(statements))
  }

  async findByBroadcasterUserIds(ids: string[]): Promise<ChannelStateRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: ChannelStateRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(channelState)
        .where(
          inArray(channelState.broadcasterUserId, ids.slice(i, i + BATCH_SIZE)),
        )
        .all()
      for (const row of rows) {
        results.push({
          broadcaster_user_id: row.broadcasterUserId,
          is_live: row.isLive === 1,
          stream_id: row.streamId,
          category_id: row.categoryId,
          category_name: row.categoryName,
          title: row.title,
          thumbnail_url: row.thumbnailUrl,
          viewer_count: row.viewerCount,
          started_at: row.startedAt,
          category_started_at: row.categoryStartedAt,
          stream_type: row.streamType,
          last_live_at: row.lastLiveAt,
          last_category_id: row.lastCategoryId,
          last_category_name: row.lastCategoryName,
          updated_from_event_at: row.updatedFromEventAt,
          updated_at: row.updatedAt,
        })
      }
    }
    return results
  }

  async findByBroadcasterUserId(
    id: string,
  ): Promise<ChannelStateRecord | null> {
    const rows = await this.findByBroadcasterUserIds([id])
    return rows[0] ?? null
  }
}
