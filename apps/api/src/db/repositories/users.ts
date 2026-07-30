import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { User } from "../../types"
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
  }
}
