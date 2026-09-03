import { eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { Language, User } from "../../types"
import type { AppDatabase } from "../client"
import { users, type UserRow } from "../schema"

export interface UpsertUserInput {
  id: string
  twitchUserId: string
  twitchLogin: string
  twitchDisplayName: string
  now: string
}

export interface UpsertUserByTwitchIdInput {
  twitchUserId: string
  twitchLogin: string
  twitchDisplayName: string
  now: string
}

export class UsersRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async upsert(input: UpsertUserInput): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: input.id,
        twitchUserId: input.twitchUserId,
        twitchLogin: input.twitchLogin,
        twitchDisplayName: input.twitchDisplayName,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          twitchUserId: input.twitchUserId,
          twitchLogin: input.twitchLogin,
          twitchDisplayName: input.twitchDisplayName,
          updatedAt: input.now,
        },
      })
      .run()
  }

  /**
   * Upserts by Twitch user id, resolving whether this is a first-time login
   * (mint a new `usr_` id) or a returning user (keep the existing row's id)
   * internally, so callers no longer need to look up the existing user just
   * to decide whether to generate an id.
   */
  async upsertByTwitchUserId(
    input: UpsertUserByTwitchIdInput,
  ): Promise<string> {
    const existing = await this.findByTwitchUserId(input.twitchUserId)
    const id = existing?.id ?? `usr_${nanoid()}`
    await this.upsert({
      id,
      twitchUserId: input.twitchUserId,
      twitchLogin: input.twitchLogin,
      twitchDisplayName: input.twitchDisplayName,
      now: input.now,
    })
    return id
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.id, id)).get()
    return row ? toUser(row) : null
  }

  async findByTwitchUserId(twitchUserId: string): Promise<User | null> {
    const row = await this.db
      .select()
      .from(users)
      .where(eq(users.twitchUserId, twitchUserId))
      .get()
    return row ? toUser(row) : null
  }

  async updateLastFollowSyncAt(
    id: string,
    lastFollowSyncAt: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ lastFollowSyncAt, updatedAt: now })
      .where(eq(users.id, id))
      .run()
  }

  /** Sets the user's UI/notification language preference (ADR 0044). */
  async updateLanguage(
    id: string,
    language: Language,
    now: string,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ language, updatedAt: now })
      .where(eq(users.id, id))
      .run()
  }

  /**
   * Batch language lookup for notification matching (ADR 0044), where the
   * matched-user set can exceed D1's 100-bound-parameter limit per query.
   * Users missing from the result (should not happen — the column has a
   * NOT NULL default) are the caller's responsibility to default to "en".
   */
  async findLanguagesByIds(ids: string[]): Promise<Map<string, Language>> {
    const result = new Map<string, Language>()
    if (ids.length === 0) return result
    const BATCH_SIZE = 100
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select({ id: users.id, language: users.language })
        .from(users)
        .where(inArray(users.id, ids.slice(i, i + BATCH_SIZE)))
        .all()
      for (const row of rows) result.set(row.id, row.language as Language)
    }
    return result
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    twitch_user_id: row.twitchUserId,
    twitch_login: row.twitchLogin,
    twitch_display_name: row.twitchDisplayName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    last_follow_sync_at: row.lastFollowSyncAt,
    language: row.language as Language,
  }
}
