import { and, eq, isNull } from "drizzle-orm"
import type { PushSubscriptionRecord } from "../../types"
import type { AppDatabase } from "../client"
import { pushSubscriptions, type PushSubscriptionRow } from "../schema"

export interface CreatePushSubscriptionInput {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  now: string
}

export interface RefreshPushSubscriptionInput {
  id: string
  userId: string
  p256dh: string
  auth: string
  userAgent: string | null
  now: string
}

export class PushSubscriptionsRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

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
        updatedAt: input.now,
      })
      .run()
  }

  async findById(id: string): Promise<PushSubscriptionRecord | null> {
    const row = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.id, id))
      .get()
    return row ? toPushSubscription(row) : null
  }

  async findByEndpoint(
    endpoint: string,
  ): Promise<PushSubscriptionRecord | null> {
    const row = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get()
    return row ? toPushSubscription(row) : null
  }

  // Re-claims an existing endpoint row: refreshes keys, reassigns the owner,
  // and clears any prior revocation (see ADR 0027).
  async refresh(input: RefreshPushSubscriptionInput): Promise<void> {
    await this.db
      .update(pushSubscriptions)
      .set({
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        updatedAt: input.now,
        revokedAt: null,
      })
      .where(eq(pushSubscriptions.id, input.id))
      .run()
  }

  /** All of a user's subscriptions, revoked included (test-seam inspection). */
  async listByUserId(userId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all()
    return rows.map(toPushSubscription)
  }

  /** Non-revoked subscriptions — the send targets for a user's deliveries. */
  async listActiveByUserId(userId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          isNull(pushSubscriptions.revokedAt),
        ),
      )
      .all()
    return rows.map(toPushSubscription)
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    await this.db
      .update(pushSubscriptions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(eq(pushSubscriptions.id, id))
      .run()
  }
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
    revoked_at: row.revokedAt,
  }
}
