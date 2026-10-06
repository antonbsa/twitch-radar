import type { Database } from "../db"
import type { AppConfig, Env } from "../env"
import { logger, serializeError } from "../logger"
import { processTwitchEventMessage } from "../services/eventsub/process"
import { matchAndCreateDeliveries } from "../services/notifications/match"
import type { TwitchEventQueueMessage } from "../types"

/**
 * Ack/retry per message so one failure doesn't replay the whole batch
 * (replays are safe anyway — processing dedupes on message id and matching
 * dedupes on the delivery key).
 */
export async function consumeTwitchEvents(
  batch: MessageBatch,
  db: Database,
  config: AppConfig,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const eventMessage = message.body as TwitchEventQueueMessage
    try {
      const change = await processTwitchEventMessage(
        db,
        config,
        env.KV_APP_CACHE,
        eventMessage,
      )
      if (change) {
        await matchAndCreateDeliveries(db, env.NOTIFICATION_JOBS_QUEUE, change)
      }
      logger.debug("Twitch event processed", {
        messageId: eventMessage.messageId,
        eventType: eventMessage.eventType,
        stateChanged: change !== null,
      })
      message.ack()
    } catch (error) {
      logger.error("Twitch event processing failed", {
        messageId: eventMessage.messageId,
        ...serializeError(error),
      })
      message.retry()
    }
  }
}
