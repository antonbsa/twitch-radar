import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
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
  const body = await c.req.json().catch(() => null)
  const parsed = CreateSnoozeSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", "Invalid snooze payload")
  }
  const { broadcaster_user_id: broadcasterUserId, category_id: categoryId } =
    parsed.data

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
