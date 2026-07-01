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
            updatedAt: input.now,
          },
        })
        .run()
    }
  }

  async findByBroadcasterUserIds(ids: string[]): Promise<ChannelStateRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(channelState)
      .where(inArray(channelState.broadcasterUserId, ids))
      .all()
    return rows.map((row) => ({
      broadcaster_user_id: row.broadcasterUserId,
      is_live: row.isLive === 1,
      stream_id: row.streamId,
      category_id: row.categoryId,
      category_name: row.categoryName,
      title: row.title,
      viewer_count: row.viewerCount,
      started_at: row.startedAt,
      updated_at: row.updatedAt,
    }))
  }
}
