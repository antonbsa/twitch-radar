import { and, eq } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { followedChannels } from "../schema"

export interface UpsertFollowedChannelInput {
  userId: string
  broadcasterUserId: string
  broadcasterLogin: string
  broadcasterDisplayName: string
  broadcasterProfileImageUrl?: string | null
  followedAt?: string | null
  now: string
}

export interface FollowedChannelRecord {
  user_id: string
  broadcaster_user_id: string
  broadcaster_login: string
  broadcaster_display_name: string
  broadcaster_profile_image_url: string | null
  followed_at: string | null
  last_synced_at: string
}

export class FollowedChannelsRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async upsertAll(inputs: UpsertFollowedChannelInput[]): Promise<void> {
    for (const input of inputs) {
      await this.db
        .insert(followedChannels)
        .values({
          userId: input.userId,
          broadcasterUserId: input.broadcasterUserId,
          broadcasterLogin: input.broadcasterLogin,
          broadcasterDisplayName: input.broadcasterDisplayName,
          broadcasterProfileImageUrl: input.broadcasterProfileImageUrl ?? null,
          followedAt: input.followedAt ?? null,
          lastSyncedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [followedChannels.userId, followedChannels.broadcasterUserId],
          set: {
            broadcasterLogin: input.broadcasterLogin,
            broadcasterDisplayName: input.broadcasterDisplayName,
            broadcasterProfileImageUrl:
              input.broadcasterProfileImageUrl ?? null,
            followedAt: input.followedAt ?? null,
            lastSyncedAt: input.now,
          },
        })
        .run()
    }
  }

  async findOne(
    userId: string,
    broadcasterUserId: string,
  ): Promise<FollowedChannelRecord | null> {
    const row = await this.db
      .select()
      .from(followedChannels)
      .where(
        and(
          eq(followedChannels.userId, userId),
          eq(followedChannels.broadcasterUserId, broadcasterUserId),
        ),
      )
      .get()
    if (!row) return null
    return {
      user_id: row.userId,
      broadcaster_user_id: row.broadcasterUserId,
      broadcaster_login: row.broadcasterLogin,
      broadcaster_display_name: row.broadcasterDisplayName,
      broadcaster_profile_image_url: row.broadcasterProfileImageUrl,
      followed_at: row.followedAt,
      last_synced_at: row.lastSyncedAt,
    }
  }

  async findUserIdsByBroadcasterUserId(
    broadcasterUserId: string,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ userId: followedChannels.userId })
      .from(followedChannels)
      .where(eq(followedChannels.broadcasterUserId, broadcasterUserId))
      .all()
    return rows.map((row) => row.userId)
  }

  async findByUserId(userId: string): Promise<FollowedChannelRecord[]> {
    const rows = await this.db
      .select()
      .from(followedChannels)
      .where(eq(followedChannels.userId, userId))
      .all()
    return rows.map((row) => ({
      user_id: row.userId,
      broadcaster_user_id: row.broadcasterUserId,
      broadcaster_login: row.broadcasterLogin,
      broadcaster_display_name: row.broadcasterDisplayName,
      broadcaster_profile_image_url: row.broadcasterProfileImageUrl,
      followed_at: row.followedAt,
      last_synced_at: row.lastSyncedAt,
    }))
  }
}
