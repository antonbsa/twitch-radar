import { and, asc, eq, isNull, lt } from "drizzle-orm"
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
  refresh_failed_at: string | null
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
          // Fresh tokens mean the connection works again (re-auth or refresh).
          refreshFailedAt: null,
        },
      })
      .run()
  }

  /**
   * Tokens expiring before `cutoff` that have not already failed a refresh —
   * the proactive refresh sweep's work queue. A failed row is excluded until
   * the user reconnects (re-auth clears the flag via upsert).
   */
  async findExpiringBefore(
    cutoff: string,
    limit: number,
  ): Promise<TwitchTokenRecord[]> {
    const rows = await this.db
      .select()
      .from(twitchTokens)
      .where(
        and(
          lt(twitchTokens.expiresAt, cutoff),
          isNull(twitchTokens.refreshFailedAt),
        ),
      )
      .orderBy(asc(twitchTokens.expiresAt))
      .limit(limit)
      .all()
    return rows.map(toRecord)
  }

  async markRefreshFailed(userId: string, now: string): Promise<void> {
    await this.db
      .update(twitchTokens)
      .set({ refreshFailedAt: now, updatedAt: now })
      .where(eq(twitchTokens.userId, userId))
      .run()
  }

  async findByUserId(userId: string): Promise<TwitchTokenRecord | null> {
    const row = await this.db
      .select()
      .from(twitchTokens)
      .where(eq(twitchTokens.userId, userId))
      .get()
    return row ? toRecord(row) : null
  }
}

function toRecord(row: typeof twitchTokens.$inferSelect): TwitchTokenRecord {
  return {
    user_id: row.userId,
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expires_at: row.expiresAt,
    scopes: row.scopes,
    updated_at: row.updatedAt,
    refresh_failed_at: row.refreshFailedAt,
  }
}
