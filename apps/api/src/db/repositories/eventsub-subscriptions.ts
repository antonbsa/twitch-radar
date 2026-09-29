import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm"
import { nanoid } from "nanoid"
import { asBatch, type AppDatabase } from "../client"
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
  failure_count: number
  next_retry_at: string | null
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
    failure_count: row.failureCount,
    next_retry_at: row.nextRetryAt,
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
   * Ensures a local row exists for each monitored event type of every given
   * broadcaster. New rows start as `pending`; T-007's creation/reconciliation
   * job picks pending rows up and creates them on Twitch. Existing rows
   * (any status) are left untouched — reconciliation owns status repair.
   *
   * Issues a single multi-row `INSERT ... ON CONFLICT DO NOTHING` per chunk
   * instead of one statement per (broadcaster, event type) pair. Each row
   * binds 9 params, so the chunk size accounts for D1's 100-bound-parameter
   * limit on total params, not just row count. All chunk statements are then
   * submitted via a single `db.batch()` call instead of one await per
   * chunk — see the batch()-limits note in followed-channels.ts's
   * upsertAll.
   */
  async ensurePending(
    broadcasterUserIds: string[],
    callbackUrl: string,
    now: string,
  ): Promise<void> {
    if (broadcasterUserIds.length === 0) return

    const rows = broadcasterUserIds.flatMap((broadcasterUserId) =>
      MONITORED_EVENT_TYPES.map((eventType) => ({
        id: `esub_${nanoid()}`,
        broadcasterUserId,
        eventType,
        eventVersion: EVENT_VERSIONS[eventType],
        status: "pending" as const,
        callbackUrl,
        secretVersion: "1",
        createdAt: now,
        updatedAt: now,
      })),
    )

    // Drizzle binds a param for every column that has a schema-level
    // `.default(...)` too (not just the columns explicitly set above), so
    // this must count `failureCount`'s default alongside the 9 explicit
    // fields — `nextRetryAt` has no default and stays column-count-free.
    const PARAMS_PER_ROW = 10
    const BATCH_SIZE = Math.floor(100 / PARAMS_PER_ROW)
    const statements = []
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      statements.push(
        this.db
          .insert(eventsubSubscriptions)
          .values(rows.slice(i, i + BATCH_SIZE))
          .onConflictDoNothing({
            target: [
              eventsubSubscriptions.broadcasterUserId,
              eventsubSubscriptions.eventType,
              eventsubSubscriptions.eventVersion,
            ],
          }),
      )
    }
    await this.db.batch(asBatch(statements))
  }

  /**
   * `pending` rows due for a (re)try — excludes rows still serving out their
   * backoff window (ADR 0049), whether never-tried (`nextRetryAt` null) or
   * due (`nextRetryAt` at or before `now`).
   */
  async findPending(
    limit: number,
    now: string,
  ): Promise<EventsubSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(eventsubSubscriptions)
      .where(
        and(
          eq(eventsubSubscriptions.status, "pending"),
          or(
            isNull(eventsubSubscriptions.nextRetryAt),
            lte(eventsubSubscriptions.nextRetryAt, now),
          ),
        ),
      )
      .orderBy(
        asc(eventsubSubscriptions.createdAt),
        asc(eventsubSubscriptions.id),
      )
      .limit(limit)
      .all()
    return rows.map(toRecord)
  }

  /**
   * Records the Twitch-side subscription id and Twitch's initial status.
   * Clears any accumulated failure/backoff state (ADR 0049) — a successful
   * create means the row's next visit starts a clean failure count.
   */
  async markCreated(
    id: string,
    twitchSubscriptionId: string,
    status: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({
        twitchSubscriptionId,
        status,
        failureCount: 0,
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(eq(eventsubSubscriptions.id, id))
      .run()
  }

  /**
   * Records a failed create attempt (ADR 0049): advances `failureCount` and
   * either schedules the next backoff retry (`status` stays `pending`) or
   * flips the row to the terminal `failed` status, whichever the caller
   * decided based on the new failure count.
   */
  async recordCreateFailure(
    id: string,
    params: {
      failureCount: number
      nextRetryAt: string | null
      status: "pending" | "failed"
      now: string
    },
  ): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({
        failureCount: params.failureCount,
        nextRetryAt: params.nextRetryAt,
        status: params.status,
        updatedAt: params.now,
      })
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
   * job recreates it on Twitch (reconciliation repair, ADR 0036). Also used
   * to bring a terminal `failed` row back after its cooldown (ADR 0049), so
   * failure/backoff state is cleared here too — a fresh attempt cycle starts
   * at zero rather than carrying over the count that got it flagged `failed`.
   */
  async resetToPending(id: string, now: string): Promise<void> {
    await this.db
      .update(eventsubSubscriptions)
      .set({
        twitchSubscriptionId: null,
        status: "pending",
        revokedAt: null,
        failureCount: 0,
        nextRetryAt: null,
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
