import { eq } from "drizzle-orm";
import type { User } from "../../types";
import type { AppDatabase } from "../client";
import { users, type UserRow } from "../schema";

export interface UpsertUserInput {
  id: string;
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
  now: string;
}

export class UsersRepository {
  constructor(private readonly db: AppDatabase) {}

  async upsert(input: UpsertUserInput): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: input.id,
        twitchUserId: input.twitchUserId,
        twitchLogin: input.twitchLogin,
        twitchDisplayName: input.twitchDisplayName,
        createdAt: input.now,
        updatedAt: input.now
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          twitchUserId: input.twitchUserId,
          twitchLogin: input.twitchLogin,
          twitchDisplayName: input.twitchDisplayName,
          updatedAt: input.now
        }
      })
      .run();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.id, id)).get();
    return row ? toUser(row) : null;
  }

  async findByTwitchUserId(twitchUserId: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.twitchUserId, twitchUserId)).get();
    return row ? toUser(row) : null;
  }

  async updateLastFollowSyncAt(id: string, lastFollowSyncAt: string, now: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastFollowSyncAt, updatedAt: now })
      .where(eq(users.id, id))
      .run();
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
    last_follow_sync_at: row.lastFollowSyncAt
  };
}
