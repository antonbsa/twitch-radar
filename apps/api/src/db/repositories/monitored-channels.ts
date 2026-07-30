import { eq, inArray, sql } from "drizzle-orm"
import type { AppDatabase } from "../client"
import { monitoredChannels } from "../schema"

export type MonitorReason = "channel_preference" | "global_preference"

export interface UpsertMonitoredChannelInput {
  broadcasterUserId: string
  broadcasterLogin?: string | null
  broadcasterDisplayName?: string | null
  monitorReason: MonitorReason
  now: string
}

export interface MonitoredChannelRecord {
  broadcaster_user_id: string
  broadcaster_login: string | null
  broadcaster_display_name: string | null
  monitor_reason: string
  created_at: string
  updated_at: string
  disabled_at: string | null
}

function toRecord(
  row: typeof monitoredChannels.$inferSelect,
): MonitoredChannelRecord {
  return {
    broadcaster_user_id: row.broadcasterUserId,
    broadcaster_login: row.broadcasterLogin,
    broadcaster_display_name: row.broadcasterDisplayName,
    monitor_reason: row.monitorReason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    disabled_at: row.disabledAt,
  }
}

export class MonitoredChannelsRepository {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /** Idempotent: an existing row is re-enabled and refreshed in place. */
  async upsertAll(inputs: UpsertMonitoredChannelInput[]): Promise<void> {
    if (inputs.length === 0) return
    // 6 bound params per row (broadcasterUserId, broadcasterLogin,
    // broadcasterDisplayName, monitorReason, createdAt, updatedAt); D1 caps
    // bound params at 100 per query, so 16 rows/batch stays under it (96).
    const BATCH_SIZE = 16
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE)
      await this.db
        .insert(monitoredChannels)
        .values(
          batch.map((input) => ({
            broadcasterUserId: input.broadcasterUserId,
            broadcasterLogin: input.broadcasterLogin ?? null,
            broadcasterDisplayName: input.broadcasterDisplayName ?? null,
            monitorReason: input.monitorReason,
            createdAt: input.now,
            updatedAt: input.now,
          })),
        )
        .onConflictDoUpdate({
          target: monitoredChannels.broadcasterUserId,
          set: {
            broadcasterLogin: sql`excluded.broadcaster_login`,
            broadcasterDisplayName: sql`excluded.broadcaster_display_name`,
            monitorReason: sql`excluded.monitor_reason`,
            updatedAt: sql`excluded.updated_at`,
            disabledAt: sql`null`,
          },
        })
        .run()
    }
  }

  async disable(broadcasterUserId: string, now: string): Promise<void> {
    await this.db
      .update(monitoredChannels)
      .set({ disabledAt: now, updatedAt: now })
      .where(eq(monitoredChannels.broadcasterUserId, broadcasterUserId))
      .run()
  }

  /** Every row — reconciliation derives the desired subscription set from it. */
  async listAll(): Promise<MonitoredChannelRecord[]> {
    const rows = await this.db.select().from(monitoredChannels).all()
    return rows.map(toRecord)
  }

  async findByBroadcasterUserIds(
    ids: string[],
  ): Promise<MonitoredChannelRecord[]> {
    if (ids.length === 0) return []
    // D1 limits bound parameters to 100 per query; batch to stay within that.
    const BATCH_SIZE = 100
    const results: MonitoredChannelRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const rows = await this.db
        .select()
        .from(monitoredChannels)
        .where(
          inArray(
            monitoredChannels.broadcasterUserId,
            ids.slice(i, i + BATCH_SIZE),
          ),
        )
        .all()
      results.push(...rows.map(toRecord))
    }
    return results
  }
}
