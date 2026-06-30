import { eq } from "drizzle-orm"
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
