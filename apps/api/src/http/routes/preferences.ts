import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import type { ChannelPreferenceRecord } from "../../db/repositories/channel-category-preferences"
import type { GlobalPreferenceRecord } from "../../db/repositories/global-category-preferences"
import type { GlobalPreferenceExclusionRecord } from "../../db/repositories/global-category-preference-exclusions"
import { ApiError } from "../errors"
import { findOwnedRecord, parseBody } from "../handlers"
import { jsonResponse } from "../response"
import {
  cleanupMonitoringForBroadcasters,
  ensureMonitoredBroadcasters,
} from "../../services/monitoring"

const CreateChannelPreferenceSchema = z.object({
  broadcaster_user_id: z.string().min(1),
  category_id: z.string().min(1),
  category_name: z.string().min(1),
})

const CreateGlobalPreferenceSchema = z.object({
  category_id: z.string().min(1),
  category_name: z.string().min(1),
})

/**
 * Wire shapes (mirrored in apps/web/src/types/preference.ts, ADR 0028) omit
 * user_id (implied by the session) and disabled_at (list returns active only).
 */
function toChannelPreferenceItem(record: ChannelPreferenceRecord) {
  return {
    id: record.id,
    broadcaster_user_id: record.broadcaster_user_id,
    category_id: record.category_id,
    category_name: record.category_name,
    created_at: record.created_at,
  }
}

function toExclusionItem(record: GlobalPreferenceExclusionRecord) {
  return {
    id: record.id,
    broadcaster_user_id: record.broadcaster_user_id,
    created_at: record.created_at,
  }
}

function toGlobalPreferenceItem(
  record: GlobalPreferenceRecord,
  exclusions: GlobalPreferenceExclusionRecord[] = [],
) {
  return {
    id: record.id,
    category_id: record.category_id,
    category_name: record.category_name,
    created_at: record.created_at,
    exclusions: exclusions.map(toExclusionItem),
  }
}

const CreateExclusionSchema = z.object({
  broadcaster_user_id: z.string().min(1),
})

export async function handleGetPreferences(
  c: Context<HonoEnv>,
): Promise<Response> {
  const [channel, global] = await Promise.all([
    c.var.db.channelCategoryPreferences.listActiveByUserId(c.var.userId),
    c.var.db.globalCategoryPreferences.listActiveByUserId(c.var.userId),
  ])

  // Exclusions are embedded per global preference, with no separate list
  // endpoint (ADR 0054).
  const exclusions =
    await c.var.db.globalCategoryPreferenceExclusions.listActiveByPreferenceIds(
      global.map((record) => record.id),
    )

  return jsonResponse({
    data: {
      channel: channel.map(toChannelPreferenceItem),
      global: global.map((record) =>
        toGlobalPreferenceItem(
          record,
          exclusions.filter((e) => e.preference_id === record.id),
        ),
      ),
    },
  })
}

export async function handleCreateChannelPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const input = await parseBody(
    c,
    CreateChannelPreferenceSchema,
    "Invalid preference payload",
  )
  const followed = await c.var.db.followedChannels.findOne(
    c.var.userId,
    input.broadcaster_user_id,
  )
  if (!followed) {
    throw new ApiError(
      400,
      "invalid_request",
      "Broadcaster is not a followed channel",
    )
  }

  // Idempotent per user/broadcaster/category: a repeated create (including
  // one after a delete) revives the existing row instead of failing.
  const existing =
    await c.var.db.channelCategoryPreferences.findByUserBroadcasterCategory(
      c.var.userId,
      input.broadcaster_user_id,
      input.category_id,
    )

  let record: ChannelPreferenceRecord
  if (existing) {
    await c.var.db.channelCategoryPreferences.reactivate(
      existing.id,
      input.category_name,
    )
    record = {
      ...existing,
      category_name: input.category_name,
      disabled_at: null,
    }
  } else {
    const now = new Date().toISOString()
    const id = await c.var.db.channelCategoryPreferences.create({
      userId: c.var.userId,
      broadcasterUserId: input.broadcaster_user_id,
      categoryId: input.category_id,
      categoryName: input.category_name,
      now,
    })
    record = {
      id,
      user_id: c.var.userId,
      broadcaster_user_id: input.broadcaster_user_id,
      category_id: input.category_id,
      category_name: input.category_name,
      created_at: now,
      disabled_at: null,
    }
  }

  // Per-channel preferences monitor only the selected broadcaster (ADR 0007).
  await ensureMonitoredBroadcasters(
    c.var.db,
    c.var.config,
    c.var.userId,
    [
      {
        broadcasterUserId: followed.broadcaster_user_id,
        broadcasterLogin: followed.broadcaster_login,
        broadcasterDisplayName: followed.broadcaster_display_name,
      },
    ],
    "channel_preference",
  )

  return jsonResponse(
    { data: toChannelPreferenceItem(record) },
    { status: existing ? 200 : 201 },
  )
}

export async function handleDeleteChannelPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const record = await findOwnedRecord(
    c,
    (id) => c.var.db.channelCategoryPreferences.findById(id),
    "Preference not found",
  )

  // Soft disable; repeating the delete is a no-op.
  if (!record.disabled_at) {
    await c.var.db.channelCategoryPreferences.disable(
      record.id,
      new Date().toISOString(),
    )
  }

  await cleanupMonitoringForBroadcasters(c.var.db, [record.broadcaster_user_id])

  return new Response(null, { status: 204 })
}

export async function handleCreateGlobalPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const input = await parseBody(
    c,
    CreateGlobalPreferenceSchema,
    "Invalid preference payload",
  )
  // Idempotent per user/category, same revival semantics as channel prefs.
  const existing =
    await c.var.db.globalCategoryPreferences.findByUserAndCategory(
      c.var.userId,
      input.category_id,
    )

  let record: GlobalPreferenceRecord
  if (existing) {
    await c.var.db.globalCategoryPreferences.reactivate(
      existing.id,
      input.category_name,
    )
    record = {
      ...existing,
      category_name: input.category_name,
      disabled_at: null,
    }
  } else {
    const now = new Date().toISOString()
    const id = await c.var.db.globalCategoryPreferences.create({
      userId: c.var.userId,
      categoryId: input.category_id,
      categoryName: input.category_name,
      now,
    })
    record = {
      id,
      user_id: c.var.userId,
      category_id: input.category_id,
      category_name: input.category_name,
      created_at: now,
      disabled_at: null,
    }
  }

  // A global preference monitors all of the user's followed broadcasters
  // (ADR 0007); follow sync keeps the set current as follows change.
  const followed = await c.var.db.followedChannels.findByUserId(c.var.userId)
  await ensureMonitoredBroadcasters(
    c.var.db,
    c.var.config,
    c.var.userId,
    followed.map((channel) => ({
      broadcasterUserId: channel.broadcaster_user_id,
      broadcasterLogin: channel.broadcaster_login,
      broadcasterDisplayName: channel.broadcaster_display_name,
    })),
    "global_preference",
  )

  const exclusions =
    await c.var.db.globalCategoryPreferenceExclusions.listActiveByPreferenceIds(
      [record.id],
    )
  return jsonResponse(
    { data: toGlobalPreferenceItem(record, exclusions) },
    { status: existing ? 200 : 201 },
  )
}

export async function handleDeleteGlobalPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const record = await findOwnedGlobalPreference(c)

  // Soft disable; repeating the delete is a no-op.
  if (!record.disabled_at) {
    await c.var.db.globalCategoryPreferences.disable(
      record.id,
      new Date().toISOString(),
    )
  }

  const followed = await c.var.db.followedChannels.findByUserId(c.var.userId)
  await cleanupMonitoringForBroadcasters(
    c.var.db,
    followed.map((channel) => channel.broadcaster_user_id),
  )

  return new Response(null, { status: 204 })
}

async function findOwnedGlobalPreference(c: Context<HonoEnv>) {
  return findOwnedRecord(
    c,
    (id) => c.var.db.globalCategoryPreferences.findById(id),
    "Preference not found",
  )
}

/**
 * Idempotent create/revive of an exclusion (ADR 0054, ADR 0029): `201` for a
 * new one, `200` when it already exists, whether active or soft-disabled.
 */
export async function handleCreateGlobalPreferenceExclusion(
  c: Context<HonoEnv>,
): Promise<Response> {
  const preference = await findOwnedGlobalPreference(c)
  const { broadcaster_user_id: broadcasterUserId } = await parseBody(
    c,
    CreateExclusionSchema,
    "Invalid exclusion payload",
  )

  const followed = await c.var.db.followedChannels.findOne(
    c.var.userId,
    broadcasterUserId,
  )
  if (!followed) {
    throw new ApiError(
      400,
      "invalid_request",
      "Broadcaster is not a followed channel",
    )
  }

  const existing =
    await c.var.db.globalCategoryPreferenceExclusions.findByPreferenceAndBroadcaster(
      preference.id,
      broadcasterUserId,
    )
  if (existing) {
    if (existing.disabled_at) {
      await c.var.db.globalCategoryPreferenceExclusions.reactivate(existing.id)
    }
    return jsonResponse({ data: toExclusionItem(existing) })
  }

  const record = await c.var.db.globalCategoryPreferenceExclusions.create({
    preferenceId: preference.id,
    broadcasterUserId,
    now: new Date().toISOString(),
  })
  return jsonResponse({ data: toExclusionItem(record) }, { status: 201 })
}

export async function handleDeleteGlobalPreferenceExclusion(
  c: Context<HonoEnv>,
): Promise<Response> {
  const preference = await findOwnedGlobalPreference(c)
  const exclusionId = c.req.param("exclusionId")
  const record = exclusionId
    ? await c.var.db.globalCategoryPreferenceExclusions.findById(exclusionId)
    : null
  if (!record || record.preference_id !== preference.id) {
    throw new ApiError(404, "not_found", "Exclusion not found")
  }

  // Soft disable; repeating the delete is a no-op.
  if (!record.disabled_at) {
    await c.var.db.globalCategoryPreferenceExclusions.disable(
      record.id,
      new Date().toISOString(),
    )
  }
  return new Response(null, { status: 204 })
}
