import type { PushSubscriptionRecord, User } from "../domain/types";

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
  constructor(private readonly db: D1Database) {}

  async upsert(input: UpsertUserInput): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO users (
          id,
          twitch_user_id,
          twitch_login,
          twitch_display_name,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          twitch_user_id = excluded.twitch_user_id,
          twitch_login = excluded.twitch_login,
          twitch_display_name = excluded.twitch_display_name,
          updated_at = excluded.updated_at
        `
      )
      .bind(input.id, input.twitchUserId, input.twitchLogin, input.twitchDisplayName, input.now, input.now)
      .run();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
    return row ?? null;
  }

  async findByTwitchUserId(twitchUserId: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE twitch_user_id = ?")
      .bind(twitchUserId)
      .first<User>();
    return row ?? null;
  }

  async updateLastFollowSyncAt(id: string, lastFollowSyncAt: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `
        UPDATE users
        SET last_follow_sync_at = ?, updated_at = ?
        WHERE id = ?
        `
      )
      .bind(lastFollowSyncAt, now, id)
      .run();
  }
}

export class PushSubscriptionsRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreatePushSubscriptionInput): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO push_subscriptions (
          id,
          user_id,
          endpoint,
          p256dh,
          auth,
          user_agent,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(input.id, input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent, input.now, input.now)
      .run();
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?")
      .bind(endpoint)
      .first<PushSubscriptionRecord>();
    return row ?? null;
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    await this.db
      .prepare(
        `
        UPDATE push_subscriptions
        SET revoked_at = ?, updated_at = ?
        WHERE id = ?
        `
      )
      .bind(revokedAt, revokedAt, id)
      .run();
  }
}

export class Database {
  readonly users: UsersRepository;
  readonly pushSubscriptions: PushSubscriptionsRepository;

  constructor(db: D1Database) {
    this.users = new UsersRepository(db);
    this.pushSubscriptions = new PushSubscriptionsRepository(db);
  }
}
