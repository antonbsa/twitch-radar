import type { Database } from "../db"
import type { AppConfig, Env } from "../env"
import { recordFailure } from "../lib/alerting"
import { logger, serializeError } from "../lib/logger"
import { processTwitchEventMessage } from "../features/eventsub/process"
import { matchAndCreateDeliveries } from "../features/notifications/match"
import type { TwitchEventQueueMessage } from "../features/eventsub/types"

/**
 * Applies one event to channel state and stages notification deliveries for
 * any resulting transition. Shared by the queue consumer and the sandbox
 * event injector (ADR 0046), which skips only the webhook + queue hops.
 * @returns the state change the event produced, or `null` when it produced none.
 */
export async function applyTwitchEvent(
  db: Database,
  config: AppConfig,
  env: Env,
  message: TwitchEventQueueMessage,
) {
  const change = await processTwitchEventMessage(
    db,
    config,
    env.KV_APP_CACHE,
    message,
  )
  if (change) {
    await matchAndCreateDeliveries(db, env.NOTIFICATION_JOBS_QUEUE, change)
  }
  return change
}

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
      const change = await applyTwitchEvent(db, config, env, eventMessage)
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
      recordFailure("Twitch event processing failed", error)
      message.retry()
    }
  }
}
