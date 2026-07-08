import { eq, inArray } from "drizzle-orm"
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
    for (const input of inputs) {
      await this.db
        .insert(monitoredChannels)
        .values({
          broadcasterUserId: input.broadcasterUserId,
          broadcasterLogin: input.broadcasterLogin ?? null,
          broadcasterDisplayName: input.broadcasterDisplayName ?? null,
          monitorReason: input.monitorReason,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: monitoredChannels.broadcasterUserId,
          set: {
            broadcasterLogin: input.broadcasterLogin ?? null,
            broadcasterDisplayName: input.broadcasterDisplayName ?? null,
            monitorReason: input.monitorReason,
            updatedAt: input.now,
            disabledAt: null,
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
