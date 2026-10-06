import type { AppConfig } from "../env"
import type { Database } from "../db"
import type { ChannelPreferenceRecord } from "../db/repositories/channel-category-preferences"
import type { GlobalPreferenceExclusionRecord } from "../db/repositories/global-category-preference-exclusions"
import type { GlobalPreferenceRecord } from "../db/repositories/global-category-preferences"
import {
  cleanupMonitoringForBroadcasters,
  ensureMonitoredBroadcasters,
} from "./monitoring"

interface PreferenceActor {
  db: Database
  config: AppConfig
  userId: string
}

export interface UpsertResult<T> {
  record: T
  /** False when an existing row (active or soft-disabled) was revived. */
  created: boolean
}

/**
 * Idempotent per user/broadcaster/category: a repeated create (including one
 * after a delete) revives the existing row instead of failing. Monitors only
 * the selected broadcaster (ADR 0007). Returns `null` when the broadcaster is
 * not one of the user's followed channels.
 */
export async function upsertChannelPreference(
  { db, config, userId }: PreferenceActor,
  input: {
    broadcasterUserId: string
    categoryId: string
    categoryName: string
  },
): Promise<UpsertResult<ChannelPreferenceRecord> | null> {
  const followed = await db.followedChannels.findOne(
    userId,
    input.broadcasterUserId,
  )
  if (!followed) return null

  const existing =
    await db.channelCategoryPreferences.findByUserBroadcasterCategory(
      userId,
      input.broadcasterUserId,
      input.categoryId,
    )

  let record: ChannelPreferenceRecord
  if (existing) {
    await db.channelCategoryPreferences.reactivate(
      existing.id,
      input.categoryName,
    )
    record = {
      ...existing,
      category_name: input.categoryName,
      disabled_at: null,
    }
  } else {
    const now = new Date().toISOString()
    const id = await db.channelCategoryPreferences.create({
      userId,
      broadcasterUserId: input.broadcasterUserId,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      now,
    })
    record = {
      id,
      user_id: userId,
      broadcaster_user_id: input.broadcasterUserId,
      category_id: input.categoryId,
      category_name: input.categoryName,
      created_at: now,
      disabled_at: null,
    }
  }

  await ensureMonitoredBroadcasters(
    db,
    config,
    userId,
    [
      {
        broadcasterUserId: followed.broadcaster_user_id,
        broadcasterLogin: followed.broadcaster_login,
        broadcasterDisplayName: followed.broadcaster_display_name,
      },
    ],
    "channel_preference",
  )

  return { record, created: !existing }
}

/** Soft-disables the preference (a repeat is a no-op) and prunes monitoring. */
export async function disableChannelPreference(
  { db }: PreferenceActor,
  record: ChannelPreferenceRecord,
): Promise<void> {
  if (!record.disabled_at) {
    await db.channelCategoryPreferences.disable(
      record.id,
      new Date().toISOString(),
    )
  }
  await cleanupMonitoringForBroadcasters(db, [record.broadcaster_user_id])
}

/**
 * Idempotent per user/category, same revival semantics as channel prefs. A
 * global preference monitors all of the user's followed broadcasters (ADR
 * 0007); follow sync keeps the set current as follows change.
 */
export async function upsertGlobalPreference(
  { db, config, userId }: PreferenceActor,
  input: { categoryId: string; categoryName: string },
): Promise<
  UpsertResult<GlobalPreferenceRecord> & {
    exclusions: GlobalPreferenceExclusionRecord[]
  }
> {
  const existing = await db.globalCategoryPreferences.findByUserAndCategory(
    userId,
    input.categoryId,
  )

  let record: GlobalPreferenceRecord
  if (existing) {
    await db.globalCategoryPreferences.reactivate(
      existing.id,
      input.categoryName,
    )
    record = {
      ...existing,
      category_name: input.categoryName,
      disabled_at: null,
    }
  } else {
    const now = new Date().toISOString()
    const id = await db.globalCategoryPreferences.create({
      userId,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      now,
    })
    record = {
      id,
      user_id: userId,
      category_id: input.categoryId,
      category_name: input.categoryName,
      created_at: now,
      disabled_at: null,
    }
  }

  const followed = await db.followedChannels.findByUserId(userId)
  await ensureMonitoredBroadcasters(
    db,
    config,
    userId,
    followed.map((channel) => ({
      broadcasterUserId: channel.broadcaster_user_id,
      broadcasterLogin: channel.broadcaster_login,
      broadcasterDisplayName: channel.broadcaster_display_name,
    })),
    "global_preference",
  )

  const exclusions =
    await db.globalCategoryPreferenceExclusions.listActiveByPreferenceIds([
      record.id,
    ])
  return { record, created: !existing, exclusions }
}

/** Soft-disables the preference (a repeat is a no-op) and prunes monitoring. */
export async function disableGlobalPreference(
  { db, userId }: PreferenceActor,
  record: GlobalPreferenceRecord,
): Promise<void> {
  if (!record.disabled_at) {
    await db.globalCategoryPreferences.disable(
      record.id,
      new Date().toISOString(),
    )
  }
  const followed = await db.followedChannels.findByUserId(userId)
  await cleanupMonitoringForBroadcasters(
    db,
    followed.map((channel) => channel.broadcaster_user_id),
  )
}
