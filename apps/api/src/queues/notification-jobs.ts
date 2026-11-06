import type { Database } from "../db"
import type { AppConfig } from "../env"
import { recordFailure } from "../lib/alerting"
import { logger, serializeError } from "../lib/logger"
import { deliverNotification } from "../features/notifications/deliver"
import type { NotificationJobMessage } from "../features/notifications/types"
import { retryDelaySeconds } from "./retry"

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
      // Send outcomes and post-send D1 writes never throw
      // (deliverNotification resolves or logs them) — a throw here happened
      // before any send, so a retry against the still-pending delivery is
      // safe (ADR 0034).
      logger.error("Notification job failed", {
        deliveryId: (message.body as NotificationJobMessage).deliveryId,
        ...serializeError(error),
      })
      recordFailure("Notification job failed", error)
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts) })
    }
  }
}
