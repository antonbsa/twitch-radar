import { asc, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { AppDatabase } from "../client"
import { eventsubSubscriptions } from "../schema"

export const MONITORED_EVENT_TYPES = [
  "stream.online",
  "stream.offline",
  "channel.update",
] as const

export type MonitoredEventType = (typeof MONITORED_EVENT_TYPES)[number]

// Event versions per the Twitch EventSub docs; channel.update's payload
// changed in version 2 (content classification labels).
const EVENT_VERSIONS: Record<MonitoredEventType, string> = {
  "stream.online": "1",
  "stream.offline": "1",
  "channel.update": "2",
}

export interface EventsubSubscriptionRecord {
  id: string
  twitch_subscription_id: string | null
  broadcaster_user_id: string
  event_type: string
  event_version: string
  status: string
  callback_url: string
  secret_version: string
  created_at: string
  updated_at: string
  revoked_at: string | null
}

function toRecord(
  row: typeof eventsubSubscriptions.$inferSelect,
): EventsubSubscriptionRecord {
  return {
    id: row.id,
    twitch_subscription_id: row.twitchSubscriptionId,
    broadcaster_user_id: row.broadcasterUserId,
    event_type: row.eventType,
    event_version: row.eventVersion,
    status: row.status,
    callback_url: row.callbackUrl,
    secret_version: row.secretVersion,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    revoked_at: row.revokedAt,
  }
}

export class EventsubSubscriptionsRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Ensures a local row exists for each monitored event type of the
   * broadcaster. New rows start as `pending`; T-007's creation/reconciliation
   * job picks pending rows up and creates them on Twitch. Existing rows
   * (any status) are left untouched — reconciliation owns status repair.
   */
  async ensurePending(
    broadcasterUserId: string,
    callbackUrl: string,
    now: string,
  ): Promise<void> {
    for (const eventType of MONITORED_EVENT_TYPES) {
      await this.db
        .insert(eventsubSubscriptions)
        .values({
          id: `esub_${nanoid()}`,
          broadcasterUserId,
          eventType,
          eventVersion: EVENT_VERSIONS[eventType],
          status: "pending",
          callbackUrl,
          secretVersion: "1",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            eventsubSubscriptions.broadcasterUserId,
            eventsubSubscriptions.eventType,
            eventsubSubscriptions.eventVersion,
          ],
        })
        .run()
    }
  }

  async findPending(limit: number): Promise<EventsubSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(eventsubSubscriptions)
      .where(eq(eventsubSubscriptions.status, "pending"))
      .orderBy(
        asc(eventsubSubscriptions.createdAt),
        asc(eventsubSubscriptions.id),
      )
      .limit(limit)
      .all()
    return rows.map(toRecord)
  }

  /** Records the Twitch-side subscription id and Twitch's initial status. */
  async markCreated(
    id: string,
    twitchSubscriptionId: string,
    status: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({ twitchSubscriptionId, status, updatedAt: now })
      .where(eq(eventsubSubscriptions.id, id))
      .run()
  }

  /** Called when Twitch's callback verification challenge is answered. */
  async markVerified(twitchSubscriptionId: string, now: string): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({ status: "enabled", updatedAt: now })
      .where(
        eq(eventsubSubscriptions.twitchSubscriptionId, twitchSubscriptionId),
      )
      .run()
  }

  /** Records a revocation message; `status` is Twitch's revocation reason. */
  async markRevoked(
    twitchSubscriptionId: string,
    status: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({ status, revokedAt: now, updatedAt: now })
      .where(
        eq(eventsubSubscriptions.twitchSubscriptionId, twitchSubscriptionId),
      )
      .run()
  }

  /** Every local row — reconciliation compares the full set against Twitch. */
  async listAll(): Promise<EventsubSubscriptionRecord[]> {
    const rows = await this.db.select().from(eventsubSubscriptions).all()
    return rows.map(toRecord)
  }

  /**
   * Sends a row back to the start of the lifecycle so the minutely creation
   * job recreates it on Twitch (reconciliation repair, ADR 0036).
   */
  async resetToPending(id: string, now: string): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({
        twitchSubscriptionId: null,
        status: "pending",
        revokedAt: null,
        updatedAt: now,
      })
      .where(eq(eventsubSubscriptions.id, id))
      .run()
  }

  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(eventsubSubscriptions)
      .where(eq(eventsubSubscriptions.id, id))
      .run()
  }

  async findByBroadcasterUserIds(
    ids: string[],
  ): Promise<EventsubSubscriptionRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: EventsubSubscriptionRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(eventsubSubscriptions)
        .where(
          inArray(
            eventsubSubscriptions.broadcasterUserId,
            ids.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }
}
