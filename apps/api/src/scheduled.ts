import {
  CRON_EVENTSUB_RECONCILE,
  CRON_FOLLOW_SYNC,
  CRON_TOKEN_REFRESH,
} from "./crons"
import { Database } from "./db"
import { parseEnv, type Env } from "./env"
import { logger, serializeError } from "./logger"
import { createPendingEventsubSubscriptions } from "./services/eventsub/subscriptions"
import { reconcileEventsubSubscriptions } from "./services/eventsub/reconcile"
import { sweepNotificationSnoozes } from "./services/notifications/snooze-sweep"
import { refreshExpiringTwitchTokens } from "./services/twitch/token-refresh"
import { syncStaleFollows } from "./services/twitch/sync"
import {
  isAvatarRefreshSlot,
  refreshBroadcasterAvatars,
} from "./services/twitch/avatar-refresh"

/**
 * Cron fan-out (ADR 0036): each schedule owns one job so a slow or failing
 * job can't starve the others' subrequest budget, and tests can trigger
 * each in isolation via `/__scheduled?cron=...`. The default branch keeps
 * the minutely pending-subscription creation (ADR 0031) and also runs the
 * notification snooze sweep (ADR 0048): the account-wide cron trigger cap
 * (5, already fully consumed by production + preview) leaves no free slot
 * for the sweep's own schedule, and it wants a minutely cadence anyway to
 * keep the 15-minute snooze window tight. The same cap is why the monthly
 * avatar refresh is gated inside the hourly follow-sync branch.
 */
export async function runScheduled(
  controller: ScheduledController,
  env: Env,
): Promise<void> {
  // Each job function below already has its own top-level try/catch, so
  // this only remains a backstop for failures before dispatch (e.g.
  // parseEnv rejecting a malformed binding) — without it, such an error
  // would escape as Cloudflare's bare automatic exception capture instead
  // of our structured log.
  try {
    const config = parseEnv(env)
    logger.configure(config.environment)
    const db = new Database(env.DB)

    switch (controller.cron) {
      case CRON_EVENTSUB_RECONCILE:
        return await reconcileEventsubSubscriptions(
          db,
          config,
          env.KV_APP_CACHE,
        )
      case CRON_TOKEN_REFRESH:
        return await refreshExpiringTwitchTokens(db, config)
      case CRON_FOLLOW_SYNC:
        // Both jobs catch and log their own failures, so neither can skip
        // the other.
        await syncStaleFollows(db, config)
        if (isAvatarRefreshSlot(controller.scheduledTime)) {
          await refreshBroadcasterAvatars(db, config, env.KV_APP_CACHE)
        }
        return
      default:
        await createPendingEventsubSubscriptions(db, config, env.KV_APP_CACHE)
        return await sweepNotificationSnoozes(db, env.NOTIFICATION_JOBS_QUEUE)
    }
  } catch (error) {
    logger.error("Scheduled job failed", {
      cron: controller.cron,
      ...serializeError(error),
    })
  }
}
