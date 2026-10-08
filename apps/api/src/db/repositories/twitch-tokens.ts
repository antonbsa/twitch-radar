import { and, asc, eq, isNull, lt, or } from "drizzle-orm"
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
  validated_at: string | null
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
        validatedAt: input.now,
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
          // A token just issued is valid by definition.
          validatedAt: input.now,
          // The refresh that issued it is over, so release its claim.
          refreshLockedUntil: null,
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

  /**
   * Tokens not yet confirmed valid since `cutoff` (never-validated first) that
   * haven't failed a refresh — the validation sweep's work queue.
   */
  async findDueForValidation(
    cutoff: string,
    limit: number,
  ): Promise<TwitchTokenRecord[]> {
    const rows = await this.db
      .select()
      .from(twitchTokens)
      .where(
        and(
          isNull(twitchTokens.refreshFailedAt),
          or(
            isNull(twitchTokens.validatedAt),
            lt(twitchTokens.validatedAt, cutoff),
          ),
        ),
      )
      .orderBy(asc(twitchTokens.validatedAt))
      .limit(limit)
      .all()
    return rows.map(toRecord)
  }

  /**
   * Claims the right to refresh this user's token until `until`, in one
   * statement so exactly one concurrent caller wins. Returns false when another
   * caller holds an unexpired claim.
   */
  async claimRefreshLock(
    userId: string,
    now: string,
    until: string,
  ): Promise<boolean> {
    const claimed = await this.db
      .update(twitchTokens)
      .set({ refreshLockedUntil: until })
      .where(
        and(
          eq(twitchTokens.userId, userId),
          or(
            isNull(twitchTokens.refreshLockedUntil),
            lt(twitchTokens.refreshLockedUntil, now),
          ),
        ),
      )
      .returning({ userId: twitchTokens.userId })
    return claimed.length > 0
  }

  /** Releases a claim without a successful refresh (the upsert releases it on success). */
  async releaseRefreshLock(userId: string): Promise<void> {
    await this.db
      .update(twitchTokens)
      .set({ refreshLockedUntil: null })
      .where(eq(twitchTokens.userId, userId))
      .run()
  }

  async markValidated(userId: string, now: string): Promise<void> {
    await this.db
      .update(twitchTokens)
      .set({ validatedAt: now })
      .where(eq(twitchTokens.userId, userId))
      .run()
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
    validated_at: row.validatedAt,
  }
}
