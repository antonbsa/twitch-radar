import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { asBatch, type AppDatabase } from "../client"
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
    if (inputs.length === 0) return
    // 12 bound params per row (insert: userId, broadcasterUserId,
    // broadcasterLogin, broadcasterDisplayName, broadcasterProfileImageUrl,
    // followedAt, lastSyncedAt = 7; onConflictDoUpdate set: broadcasterLogin,
    // broadcasterDisplayName, broadcasterProfileImageUrl, followedAt,
    // lastSyncedAt = 5); D1 caps bound params at 100 per query, so 8
    // rows/batch stays under it (96).
    const BATCH_SIZE = 8
    const statements = []
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE)
      statements.push(
        this.db
          .insert(followedChannels)
          .values(
            batch.map((input) => ({
              userId: input.userId,
              broadcasterUserId: input.broadcasterUserId,
              broadcasterLogin: input.broadcasterLogin,
              broadcasterDisplayName: input.broadcasterDisplayName,
              broadcasterProfileImageUrl:
                input.broadcasterProfileImageUrl ?? null,
              followedAt: input.followedAt ?? null,
              lastSyncedAt: input.now,
            })),
          )
          .onConflictDoUpdate({
            target: [
              followedChannels.userId,
              followedChannels.broadcasterUserId,
            ],
            set: {
              broadcasterLogin: sql`excluded.broadcaster_login`,
              broadcasterDisplayName: sql`excluded.broadcaster_display_name`,
              // A null avatar (new follow whose lookup failed) never blanks a
              // stored one; Twitch always returns a URL, even its default image.
              broadcasterProfileImageUrl: sql`coalesce(excluded.broadcaster_profile_image_url, followed_channels.broadcaster_profile_image_url)`,
              followedAt: sql`excluded.followed_at`,
              lastSyncedAt: sql`excluded.last_synced_at`,
            },
          }),
      )
    }
    // Submits every chunk statement in a single D1 round trip (atomic)
    // instead of one await per chunk. Cloudflare doesn't document a cap on
    // the number of statements per batch() call, only per-statement limits
    // (100 bound params, 100KB SQL text) and an overall 30s duration —
    // https://developers.cloudflare.com/d1/platform/limits — so no further
    // chunking of the batch call itself is needed at realistic follow-list
    // sizes (hundreds of broadcasters -> tens of chunk statements).
    await this.db.batch(asBatch(statements))
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

  /** Stored avatars for a user's follows, keyed by broadcaster id; rows without one are absent. */
  async findProfileImageUrlsByUserId(
    userId: string,
  ): Promise<Map<string, string>> {
    const rows = await this.db
      .select({
        broadcasterUserId: followedChannels.broadcasterUserId,
        url: followedChannels.broadcasterProfileImageUrl,
      })
      .from(followedChannels)
      .where(
        and(
          eq(followedChannels.userId, userId),
          isNotNull(followedChannels.broadcasterProfileImageUrl),
        ),
      )
      .all()
    return new Map(
      rows.flatMap((row) =>
        row.url ? [[row.broadcasterUserId, row.url]] : [],
      ),
    )
  }

  /** Any follower's stored avatar for the broadcaster; they're all the same Twitch user. */
  async findProfileImageUrl(broadcasterUserId: string): Promise<string | null> {
    const row = await this.db
      .select({ url: followedChannels.broadcasterProfileImageUrl })
      .from(followedChannels)
      .where(
        and(
          eq(followedChannels.broadcasterUserId, broadcasterUserId),
          isNotNull(followedChannels.broadcasterProfileImageUrl),
        ),
      )
      .limit(1)
      .get()
    return row?.url ?? null
  }

  async listDistinctBroadcasterUserIds(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ broadcasterUserId: followedChannels.broadcasterUserId })
      .from(followedChannels)
      .all()
    return rows.map((row) => row.broadcasterUserId)
  }

  /** Sets the avatar on every follow row of each broadcaster, in one D1 round trip. */
  async updateProfileImageUrls(
    updates: Array<{ broadcasterUserId: string; profileImageUrl: string }>,
  ): Promise<void> {
    if (updates.length === 0) return
    await this.db.batch(
      asBatch(
        updates.map((update) =>
          this.db
            .update(followedChannels)
            .set({ broadcasterProfileImageUrl: update.profileImageUrl })
            .where(
              eq(followedChannels.broadcasterUserId, update.broadcasterUserId),
            ),
        ),
      ),
    )
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

  /** Follower user ids for each of the given broadcasters, keyed by broadcaster id. */
  async findUserIdsByBroadcasterUserIds(
    broadcasterUserIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (broadcasterUserIds.length === 0) return result
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    for (let i = 0; i < broadcasterUserIds.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select({
          userId: followedChannels.userId,
          broadcasterUserId: followedChannels.broadcasterUserId,
        })
        .from(followedChannels)
        .where(
          inArray(
            followedChannels.broadcasterUserId,
            broadcasterUserIds.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      for (const row of rows) {
        const followers = result.get(row.broadcasterUserId)
        if (followers) {
          followers.push(row.userId)
        } else {
          result.set(row.broadcasterUserId, [row.userId])
        }
      }
    }
    return result
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
