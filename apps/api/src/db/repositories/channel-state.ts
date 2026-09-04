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
  // Twitch's message timestamp when the write comes from an EventSub event;
  // the stale-event guard compares against it (ADR 0033). Seeding leaves it
  // unset so the first event for a seeded channel always processes.
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
  updated_from_event_at: string | null
  updated_at: string
}

export class ChannelStateRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async upsertAll(inputs: UpsertChannelStateInput[]): Promise<void> {
    if (inputs.length === 0) return
    // 11 bound params per row (broadcasterUserId, isLive, streamId,
    // categoryId, categoryName, title, thumbnailUrl, viewerCount, startedAt,
    // updatedFromEventAt, updatedAt); D1 caps bound params at 100 per query,
    // so 9 rows/batch (99 params) stays safely under that limit.
    const BATCH_SIZE = 9
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
              updatedFromEventAt: input.updatedFromEventAt ?? null,
              updatedAt: input.now,
            })),
          )
          .onConflictDoUpdate({
            target: channelState.broadcasterUserId,
            set: {
              isLive: sql`excluded.is_live`,
              streamId: sql`excluded.stream_id`,
              categoryId: sql`excluded.category_id`,
              categoryName: sql`excluded.category_name`,
              title: sql`excluded.title`,
              thumbnailUrl: sql`excluded.thumbnail_url`,
              viewerCount: sql`excluded.viewer_count`,
              startedAt: sql`excluded.started_at`,
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
