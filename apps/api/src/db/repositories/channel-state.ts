import { inArray } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { channelState } from "../schema"

export interface UpsertChannelStateInput {
  broadcasterUserId: string
  isLive: boolean
  streamId?: string | null
  categoryId?: string | null
  categoryName?: string | null
  title?: string | null
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
    for (const input of inputs) {
      await this.db
        .insert(channelState)
        .values({
          broadcasterUserId: input.broadcasterUserId,
          isLive: input.isLive ? 1 : 0,
          streamId: input.streamId ?? null,
          categoryId: input.categoryId ?? null,
          categoryName: input.categoryName ?? null,
          title: input.title ?? null,
          viewerCount: input.viewerCount ?? null,
          startedAt: input.startedAt ?? null,
          updatedFromEventAt: input.updatedFromEventAt ?? null,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: channelState.broadcasterUserId,
          set: {
            isLive: input.isLive ? 1 : 0,
            streamId: input.streamId ?? null,
            categoryId: input.categoryId ?? null,
            categoryName: input.categoryName ?? null,
            title: input.title ?? null,
            viewerCount: input.viewerCount ?? null,
            startedAt: input.startedAt ?? null,
            updatedFromEventAt: input.updatedFromEventAt ?? null,
            updatedAt: input.now,
          },
        })
        .run()
    }
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
