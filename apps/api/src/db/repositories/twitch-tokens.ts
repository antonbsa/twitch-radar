import { eq } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { twitchTokens } from "../schema"

export interface UpsertTwitchTokenInput {
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  scopes: string
  now: string
}

export interface TwitchTokenRecord {
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  scopes: string
  updated_at: string
}

export class TwitchTokensRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async upsert(input: UpsertTwitchTokenInput): Promise<void> {
    await this.db
      .insert(twitchTokens)
      .values({
        userId: input.userId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: twitchTokens.userId,
        set: {
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt: input.expiresAt,
          scopes: input.scopes,
          updatedAt: input.now,
        },
      })
      .run()
  }

  async findByUserId(userId: string): Promise<TwitchTokenRecord | null> {
    const row = await this.db
      .select()
      .from(twitchTokens)
      .where(eq(twitchTokens.userId, userId))
      .get()
    if (!row) return null
    return {
      user_id: row.userId,
      access_token: row.accessToken,
      refresh_token: row.refreshToken,
      expires_at: row.expiresAt,
      scopes: row.scopes,
      updated_at: row.updatedAt,
    }
  }
}
