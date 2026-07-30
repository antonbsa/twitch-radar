import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import type { ChannelPreferenceRecord } from "../../db/repositories/channel-category-preferences"
import type { GlobalPreferenceRecord } from "../../db/repositories/global-category-preferences"
import { ApiError } from "../errors"
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

// Wire shapes (mirrored in apps/web/src/types/preference.ts, ADR 0028) omit
// user_id (implied by the session) and disabled_at (list returns active only).
function toChannelPreferenceItem(record: ChannelPreferenceRecord) {
  return {
    id: record.id,
    broadcaster_user_id: record.broadcaster_user_id,
    category_id: record.category_id,
    category_name: record.category_name,
    created_at: record.created_at,
  }
}

function toGlobalPreferenceItem(record: GlobalPreferenceRecord) {
  return {
    id: record.id,
    category_id: record.category_id,
    category_name: record.category_name,
    created_at: record.created_at,
  }
}

export async function handleGetPreferences(
  c: Context<HonoEnv>,
): Promise<Response> {
  const [channel, global] = await Promise.all([
    c.var.db.channelCategoryPreferences.listActiveByUserId(c.var.userId),
    c.var.db.globalCategoryPreferences.listActiveByUserId(c.var.userId),
  ])

  return jsonResponse({
    data: {
      channel: channel.map(toChannelPreferenceItem),
      global: global.map(toGlobalPreferenceItem),
    },
  })
}

export async function handleCreateChannelPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null)
  const parsed = CreateChannelPreferenceSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", "Invalid preference payload")
  }

  const input = parsed.data
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

  let id: string
  if (existing) {
    id = existing.id
    await c.var.db.channelCategoryPreferences.reactivate(
      id,
      input.category_name,
    )
  } else {
    const created = await c.var.db.channelCategoryPreferences.create({
      userId: c.var.userId,
      broadcasterUserId: input.broadcaster_user_id,
      categoryId: input.category_id,
      categoryName: input.category_name,
      now: new Date().toISOString(),
    })
    id = created.id
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

  const record = await c.var.db.channelCategoryPreferences.findById(id)
  if (!record) throw new Error("Preference not found after write")
  return jsonResponse(
    { data: toChannelPreferenceItem(record) },
    { status: existing ? 200 : 201 },
  )
}

export async function handleDeleteChannelPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const id = c.req.param("id")
  const record = id
    ? await c.var.db.channelCategoryPreferences.findById(id)
    : null
  if (!record || record.user_id !== c.var.userId) {
    throw new ApiError(404, "not_found", "Preference not found")
  }

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
  const body = await c.req.json().catch(() => null)
  const parsed = CreateGlobalPreferenceSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", "Invalid preference payload")
  }

  const input = parsed.data
  // Idempotent per user/category, same revival semantics as channel prefs.
  const existing =
    await c.var.db.globalCategoryPreferences.findByUserAndCategory(
      c.var.userId,
      input.category_id,
    )

  let id: string
  if (existing) {
    id = existing.id
    await c.var.db.globalCategoryPreferences.reactivate(id, input.category_name)
  } else {
    const created = await c.var.db.globalCategoryPreferences.create({
      userId: c.var.userId,
      categoryId: input.category_id,
      categoryName: input.category_name,
      now: new Date().toISOString(),
    })
    id = created.id
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

  const record = await c.var.db.globalCategoryPreferences.findById(id)
  if (!record) throw new Error("Preference not found after write")
  return jsonResponse(
    { data: toGlobalPreferenceItem(record) },
    { status: existing ? 200 : 201 },
  )
}

export async function handleDeleteGlobalPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const id = c.req.param("id")
  const record = id
    ? await c.var.db.globalCategoryPreferences.findById(id)
    : null
  if (!record || record.user_id !== c.var.userId) {
    throw new ApiError(404, "not_found", "Preference not found")
  }

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
