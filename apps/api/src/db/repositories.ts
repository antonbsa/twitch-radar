import { eq } from "drizzle-orm";
import type { PushSubscriptionRecord, User } from "../domain/types";
import type { AppDatabase } from "./client";
import { pushSubscriptions, users, type PushSubscriptionRow, type UserRow } from "./schema";

export interface UpsertUserInput {
  id: string;
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
  now: string;
}

export interface CreatePushSubscriptionInput {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
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
      .set({
        lastFollowSyncAt,
        updatedAt: now
      })
      .where(eq(users.id, id))
      .run();
  }
}

export class PushSubscriptionsRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: CreatePushSubscriptionInput): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        id: input.id,
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        createdAt: input.now,
        updatedAt: input.now
      })
      .run();
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null> {
    const row = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
    return row ? toPushSubscription(row) : null;
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    await this.db
      .update(pushSubscriptions)
      .set({
        revokedAt,
        updatedAt: revokedAt
      })
      .where(eq(pushSubscriptions.id, id))
      .run();
  }
}

export class Database {
  readonly users: UsersRepository;
  readonly pushSubscriptions: PushSubscriptionsRepository;

  constructor(db: AppDatabase) {
    this.users = new UsersRepository(db);
    this.pushSubscriptions = new PushSubscriptionsRepository(db);
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

function toPushSubscription(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    user_id: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    user_agent: row.userAgent,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    revoked_at: row.revokedAt
  };
}
