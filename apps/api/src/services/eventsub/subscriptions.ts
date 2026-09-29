import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { logger, serializeError } from "../../logger"
import { createEventsubSubscription } from "../twitch/client"
import { getAppAccessToken } from "../twitch/app-token"

// One Twitch call per row plus the token fetch must stay well under the
// Workers subrequest limit (50 on the free plan); the next scheduled run
// picks up whatever is left.
const MAX_CREATES_PER_RUN = 30

// Exponential backoff per consecutive failure (ADR 0049): 1min, 2min, 4min,
// 8min, ... capped at 1h, so a row that fails for a transient reason doesn't
// consume the per-run budget on every single minutely invocation.
const INITIAL_BACKOFF_MS = 60_000
const MAX_BACKOFF_MS = 60 * 60_000
// After this many consecutive failures a row is presumed permanently broken
// (bad callback URL, revoked app credentials, etc.) and flips to the
// terminal `failed` status instead of retrying forever.
const MAX_CONSECUTIVE_FAILURES = 5

/**
 * Creates Twitch-side EventSub subscriptions for locally staged `pending`
 * rows due for a (re)try (ADR 0031). Rows move to Twitch's returned status
 * (normally `webhook_callback_verification_pending`); the webhook challenge
 * handler marks them `enabled` once Twitch verifies the callback. A failed
 * create is logged and the row backs off exponentially, or is flipped to the
 * terminal `failed` status after enough consecutive failures (ADR 0049) —
 * removal of subscriptions that are no longer needed is reconciliation's job.
 */
export async function createPendingEventsubSubscriptions(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    const pending = await db.eventsubSubscriptions.findPending(
      MAX_CREATES_PER_RUN,
      now,
    )
    if (pending.length === 0) return

    const appAccessToken = await getAppAccessToken(kv, config)
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
        const failureCount = row.failure_count + 1
        const failed = failureCount >= MAX_CONSECUTIVE_FAILURES
        const backoffMs = Math.min(
          INITIAL_BACKOFF_MS * 2 ** (failureCount - 1),
          MAX_BACKOFF_MS,
        )
        await db.eventsubSubscriptions.recordCreateFailure(row.id, {
          failureCount,
          nextRetryAt: failed
            ? null
            : new Date(Date.now() + backoffMs).toISOString(),
          status: failed ? "failed" : "pending",
          now,
        })
        logger.error("EventSub subscription create failed", {
          subscriptionId: row.id,
          broadcasterUserId: row.broadcaster_user_id,
          eventType: row.event_type,
          failureCount,
          status: failed ? "failed" : "pending",
          ...serializeError(error),
        })
      }
    }

    logger.info("Pending EventSub subscription creation run completed", {
      attempted: pending.length,
      succeeded,
      failed: pending.length - succeeded,
    })
  } catch (error) {
    // Anything thrown here (e.g. getAppAccessToken failing because a rotated
    // TWITCH_CLIENT_SECRET no longer matches Twitch's) would otherwise escape
    // this job uncaught, past the per-row handling above, and surface only as
    // Cloudflare's bare automatic exception capture instead of our structured
    // log.
    logger.error("Pending EventSub subscription creation run failed", {
      ...serializeError(error),
    })
  }
}
