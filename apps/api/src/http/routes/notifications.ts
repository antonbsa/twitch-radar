import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"

const SNOOZE_DURATION_MS = 15 * 60 * 1000

/**
 * Schedules a snooze reminder for a delivered notification (ADR 0048): the
 * user asked to be reminded again in 15 minutes instead of dismissing. Only
 * the delivery's own user may snooze it, and only a delivery that actually
 * reached a device (`sent`) is snoozable. Idempotent — a repeated click
 * against a delivery that already has a pending snooze returns that row
 * instead of scheduling a second reminder.
 */
export async function handleSnoozeNotification(
  c: Context<HonoEnv>,
): Promise<Response> {
  const deliveryId = c.req.param("deliveryId")
  const delivery = deliveryId
    ? await c.var.db.notificationDeliveries.findById(deliveryId)
    : null
  if (!delivery || delivery.user_id !== c.var.userId) {
    throw new ApiError(404, "not_found", "Notification delivery not found")
  }
  if (delivery.status !== "sent") {
    throw new ApiError(
      400,
      "invalid_request",
      "Only a sent notification can be snoozed",
    )
  }

  const existing =
    await c.var.db.notificationSnoozes.findPendingByOriginalDeliveryId(
      delivery.id,
    )
  if (existing) {
    return jsonResponse({ data: existing })
  }

  const now = new Date()
  const record = await c.var.db.notificationSnoozes.create({
    userId: c.var.userId,
    broadcasterUserId: delivery.broadcaster_user_id,
    categoryId: delivery.category_id,
    originalDeliveryId: delivery.id,
    fireAt: new Date(now.getTime() + SNOOZE_DURATION_MS).toISOString(),
    now: now.toISOString(),
  })
  return jsonResponse({ data: record }, { status: 201 })
}
