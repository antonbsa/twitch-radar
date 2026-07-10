import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import type { NotificationJobMessage } from "../../types"
import { sendWebPush } from "../push/web-push"

/**
 * Sends one staged delivery (ADR 0034): pushes the payload to every active
 * subscription the user has and resolves the delivery row to a terminal
 * status. Only `pending` deliveries send — a duplicate or replayed job
 * no-ops, which is what makes the enqueue side safe to over-produce.
 *
 * Send outcomes (ADR 0035):
 * - any subscription accepted → `sent` (records the first accepting one).
 * - 404/410 or undecodable keys → that subscription is revoked (ADR 0027).
 * - no subscription accepted → `failed` with per-endpoint error context.
 * - no active subscriptions at all → `skipped`.
 * There is no automatic retry: a category alert delivered late is worse
 * than one missed, and retrying after a partial success would double-notify.
 */
export async function deliverNotification(
  db: Database,
  config: AppConfig,
  message: NotificationJobMessage,
): Promise<void> {
  const delivery = await db.notificationDeliveries.findById(message.deliveryId)
  if (!delivery || delivery.status !== "pending") return

  const subscriptions = await db.pushSubscriptions.listActiveByUserId(
    message.userId,
  )
  if (subscriptions.length === 0) {
    await db.notificationDeliveries.markSkipped(
      delivery.id,
      "no_active_push_subscriptions",
    )
    return
  }

  const payload = JSON.stringify(message.payload)
  const now = new Date().toISOString()
  let sentSubscriptionId: string | null = null
  const errors: string[] = []

  for (const subscription of subscriptions) {
    const result = await sendWebPush(config, subscription, payload)
    if (result.ok) {
      sentSubscriptionId ??= subscription.id
      continue
    }
    errors.push(`${subscription.id}: ${result.error}`)
    if (result.endpointGone) {
      await db.pushSubscriptions.revoke(subscription.id, now)
      console.warn("Revoked invalid push subscription", {
        pushSubscriptionId: subscription.id,
        userId: message.userId,
        status: result.status,
      })
    }
  }

  if (sentSubscriptionId) {
    await db.notificationDeliveries.markSent(
      delivery.id,
      sentSubscriptionId,
      now,
    )
    return
  }

  await db.notificationDeliveries.markFailed(delivery.id, errors.join("; "))
  console.error("Notification delivery failed", {
    deliveryId: delivery.id,
    userId: message.userId,
    errors,
  })
}
