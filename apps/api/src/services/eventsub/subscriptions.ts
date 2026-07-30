import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { logger, serializeError } from "../../logger"
import { createEventsubSubscription } from "../twitch/client"
import { getAppAccessToken } from "../twitch/app-token"

// One Twitch call per row plus the token fetch must stay well under the
// Workers subrequest limit (50 on the free plan); the next scheduled run
// picks up whatever is left.
const MAX_CREATES_PER_RUN = 30

/**
 * Creates Twitch-side EventSub subscriptions for locally staged `pending`
 * rows (ADR 0031). Rows move to Twitch's returned status (normally
 * `webhook_callback_verification_pending`); the webhook challenge handler
 * marks them `enabled` once Twitch verifies the callback. A failed create is
 * logged and the row stays `pending` for the next run — removal of
 * subscriptions that are no longer needed is T-008's reconciliation job.
 */
export async function createPendingEventsubSubscriptions(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  const pending =
    await db.eventsubSubscriptions.findPending(MAX_CREATES_PER_RUN)
  if (pending.length === 0) return

  const appAccessToken = await getAppAccessToken(kv, config)
  const now = new Date().toISOString()
  let succeeded = 0

  for (const row of pending) {
    try {
      const created = await createEventsubSubscription(
        config.twitchClientId,
        appAccessToken,
        {
          type: row.event_type,
          version: row.event_version,
          broadcasterUserId: row.broadcaster_user_id,
          callbackUrl: row.callback_url,
          secret: config.eventsubWebhookSecret,
        },
        config.twitchApiBaseUrl,
      )
      await db.eventsubSubscriptions.markCreated(
        row.id,
        created.id,
        created.status,
        now,
      )
      succeeded += 1
    } catch (error) {
      logger.error("EventSub subscription create failed", {
        subscriptionId: row.id,
        broadcasterUserId: row.broadcaster_user_id,
        eventType: row.event_type,
        ...serializeError(error),
      })
    }
  }

  logger.info("Pending EventSub subscription creation run completed", {
    attempted: pending.length,
    succeeded,
    failed: pending.length - succeeded,
  })
}
