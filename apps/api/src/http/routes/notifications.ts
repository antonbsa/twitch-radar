import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { findOwnedRecord, parseBody } from "../handlers"
import type { BroadcasterMuteRecord } from "../../db/repositories/broadcaster-mutes"
import { jsonResponse } from "../response"

const SNOOZE_DURATION_MS = 15 * 60 * 1000

const CreateSnoozeSchema = z.object({
  broadcaster_user_id: z.string().min(1),
  category_id: z.string().min(1),
})

/**
 * Creates a reminder for a broadcaster/category. Repeated requests while a
 * matching pending snooze exists return that existing row instead of creating
 * another one.
 */
export async function handleCreateNotificationSnooze(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { broadcaster_user_id: broadcasterUserId, category_id: categoryId } =
    await parseBody(c, CreateSnoozeSchema, "Invalid snooze payload")

  const existing =
    await c.var.db.notificationSnoozes.findPendingByUserBroadcasterCategory(
      c.var.userId,
      broadcasterUserId,
      categoryId,
    )
  if (existing) {
    return jsonResponse({ data: existing })
  }

  const now = new Date()
  const record = await c.var.db.notificationSnoozes.create({
    userId: c.var.userId,
    broadcasterUserId,
    categoryId,
    fireAt: new Date(now.getTime() + SNOOZE_DURATION_MS).toISOString(),
    now: now.toISOString(),
  })
  return jsonResponse({ data: record }, { status: 201 })
}

/**
 * Lists the current user's pending snoozes so the UI can reflect scheduled
 * reminders across page reloads.
 */
export async function handleListNotificationSnoozes(
  c: Context<HonoEnv>,
): Promise<Response> {
  const records = await c.var.db.notificationSnoozes.findPendingByUserId(
    c.var.userId,
  )
  return jsonResponse({ data: records })
}

const CreateMuteSchema = z.object({ broadcaster_user_id: z.string().min(1) })

/** Wire shape omits user_id (implied by the session) and disabled_at (list is active only). */
function toMuteItem(record: BroadcasterMuteRecord) {
  return {
    id: record.id,
    broadcaster_user_id: record.broadcaster_user_id,
    created_at: record.created_at,
  }
}

/** ADR 0054: the user's active broadcaster mutes. */
export async function handleListBroadcasterMutes(
  c: Context<HonoEnv>,
): Promise<Response> {
  const records = await c.var.db.broadcasterMutes.listActiveByUserId(
    c.var.userId,
  )
  return jsonResponse({ data: records.map(toMuteItem) })
}

/**
 * Idempotent create/revive (ADR 0054, ADR 0029): `201` for a new mute, `200`
 * when it already exists, whether active or soft-disabled.
 */
export async function handleCreateBroadcasterMute(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { broadcaster_user_id: broadcasterUserId } = await parseBody(
    c,
    CreateMuteSchema,
    "Invalid mute payload",
  )

  const existing = await c.var.db.broadcasterMutes.findByUserAndBroadcaster(
    c.var.userId,
    broadcasterUserId,
  )
  if (existing) {
    if (existing.disabled_at) {
      await c.var.db.broadcasterMutes.reactivate(existing.id)
    }
    return jsonResponse({ data: toMuteItem(existing) })
  }

  const record = await c.var.db.broadcasterMutes.create({
    userId: c.var.userId,
    broadcasterUserId,
    now: new Date().toISOString(),
  })
  return jsonResponse({ data: toMuteItem(record) }, { status: 201 })
}

export async function handleDeleteBroadcasterMute(
  c: Context<HonoEnv>,
): Promise<Response> {
  const record = await findOwnedRecord(
    c,
    (id) => c.var.db.broadcasterMutes.findById(id),
    "Mute not found",
  )

  // Soft disable; repeating the delete is a no-op.
  if (!record.disabled_at) {
    await c.var.db.broadcasterMutes.disable(record.id, new Date().toISOString())
  }
  return new Response(null, { status: 204 })
}
