import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import type { ChannelPreferenceRecord } from "../../db/repositories/channel-category-preferences"
import type { GlobalPreferenceRecord } from "../../db/repositories/global-category-preferences"
import type { GlobalPreferenceExclusionRecord } from "../../db/repositories/global-category-preference-exclusions"
import { ApiError } from "../../http/errors"
import { findOwnedRecord, parseBody } from "../../http/handlers"
import { jsonResponse } from "../../http/response"
import { resolveBoxArt } from "../categories/box-art"
import {
  disableChannelPreference,
  disableGlobalPreference,
  upsertChannelPreference,
  upsertGlobalPreference,
} from "./service"

const CreateChannelPreferenceSchema = z.object({
  broadcaster_user_id: z.string().min(1),
  category_id: z.string().min(1),
  category_name: z.string().min(1),
})

const CreateGlobalPreferenceSchema = z.object({
  category_id: z.string().min(1),
  category_name: z.string().min(1),
})

type BoxArtById = Map<string, string | null>

/**
 * Wire shapes (mirrored in apps/web/src/types/preference.ts, ADR 0028) omit
 * user_id (implied by the session) and disabled_at (list returns active only).
 */
function toChannelPreferenceItem(
  record: ChannelPreferenceRecord,
  boxArt: BoxArtById,
) {
  return {
    id: record.id,
    broadcaster_user_id: record.broadcaster_user_id,
    category_id: record.category_id,
    category_name: record.category_name,
    box_art_url: boxArt.get(record.category_id) ?? null,
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
  boxArt: BoxArtById,
  exclusions: GlobalPreferenceExclusionRecord[] = [],
) {
  return {
    id: record.id,
    category_id: record.category_id,
    category_name: record.category_name,
    box_art_url: boxArt.get(record.category_id) ?? null,
    created_at: record.created_at,
    exclusions: exclusions.map(toExclusionItem),
  }
}

const CreateExclusionSchema = z.object({
  broadcaster_user_id: z.string().min(1),
})

function actor(c: Context<HonoEnv>) {
  return { db: c.var.db, config: c.var.config, userId: c.var.userId }
}

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

  const boxArt = await resolveBoxArt(
    c.var.db,
    c.var.config,
    c.var.userId,
    [...channel, ...global].map((record) => record.category_id),
  )

  return jsonResponse({
    data: {
      channel: channel.map((record) => toChannelPreferenceItem(record, boxArt)),
      global: global.map((record) =>
        toGlobalPreferenceItem(
          record,
          boxArt,
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
  const result = await upsertChannelPreference(actor(c), {
    broadcasterUserId: input.broadcaster_user_id,
    categoryId: input.category_id,
    categoryName: input.category_name,
  })
  if (!result) {
    throw new ApiError(
      400,
      "invalid_request",
      "Broadcaster is not a followed channel",
    )
  }

  const boxArt = await resolveBoxArt(c.var.db, c.var.config, c.var.userId, [
    result.record.category_id,
  ])
  return jsonResponse(
    { data: toChannelPreferenceItem(result.record, boxArt) },
    { status: result.created ? 201 : 200 },
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

  await disableChannelPreference(actor(c), record)

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
  const { record, created, exclusions } = await upsertGlobalPreference(
    actor(c),
    { categoryId: input.category_id, categoryName: input.category_name },
  )
  const boxArt = await resolveBoxArt(c.var.db, c.var.config, c.var.userId, [
    record.category_id,
  ])
  return jsonResponse(
    { data: toGlobalPreferenceItem(record, boxArt, exclusions) },
    { status: created ? 201 : 200 },
  )
}

export async function handleDeleteGlobalPreference(
  c: Context<HonoEnv>,
): Promise<Response> {
  const record = await findOwnedGlobalPreference(c)

  await disableGlobalPreference(actor(c), record)

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
