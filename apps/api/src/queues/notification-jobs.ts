import type { Database } from "../db"
import type { AppConfig } from "../env"
import { recordFailure } from "../lib/alerting"
import { logger, serializeError } from "../lib/logger"
import { deliverNotification } from "../features/notifications/deliver"
import type { NotificationJobMessage } from "../features/notifications/types"

export async function consumeNotificationJobs(
  batch: MessageBatch,
  db: Database,
  config: AppConfig,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await deliverNotification(
        db,
        config,
        message.body as NotificationJobMessage,
      )
      message.ack()
    } catch (error) {
      // Send outcomes never throw (deliverNotification resolves them to
      // delivery statuses) — a throw here is infrastructure (D1/KV), so
      // a retry against the still-pending delivery is safe.
      logger.error("Notification job failed", {
        deliveryId: (message.body as NotificationJobMessage).deliveryId,
        ...serializeError(error),
      })
      recordFailure("Notification job failed", error)
      message.retry()
    }
  }
}
