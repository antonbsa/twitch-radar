import { isPeriodicJobDue } from "./crons"
import { Database } from "./db"
import { parseEnv, type Env } from "./env"
import { logger, serializeError } from "./lib/logger"
import { createPendingEventsubSubscriptions } from "./features/eventsub/subscriptions"
import { reconcileEventsubSubscriptions } from "./features/eventsub/reconcile"
import { sweepNotificationSnoozes } from "./features/notifications/snooze-sweep"
import { refreshExpiringTwitchTokens } from "./services/twitch/token-refresh"
import { syncStaleFollows } from "./services/twitch/sync"
import {
  isAvatarRefreshSlot,
  refreshBroadcasterAvatars,
} from "./services/twitch/avatar-refresh"

/**
 * Cron fan-out (ADR 0057): the single minutely trigger runs the minutely jobs
 * (pending-subscription creation, ADR 0031; snooze sweep, ADR 0048) on every
 * invocation, plus whichever periodic job is due at `scheduledTime`'s minute
 * (ADR 0036). Tests pick the job by passing `?time=` to Miniflare's `/cdn-cgi/local/scheduled`.
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

    const { scheduledTime } = controller

    // Each job catches and logs its own failures, so none can skip the others.
    await createPendingEventsubSubscriptions(db, config, env.KV_APP_CACHE)
    await sweepNotificationSnoozes(db, env.NOTIFICATION_JOBS_QUEUE)
    if (isPeriodicJobDue("eventsub-reconcile", scheduledTime)) {
      await reconcileEventsubSubscriptions(db, config, env.KV_APP_CACHE)
    }
    if (isPeriodicJobDue("token-refresh", scheduledTime)) {
      await refreshExpiringTwitchTokens(db, config)
    }
    if (isPeriodicJobDue("follow-sync", scheduledTime)) {
      await syncStaleFollows(db, config)
      if (isAvatarRefreshSlot(scheduledTime)) {
        await refreshBroadcasterAvatars(db, config, env.KV_APP_CACHE)
      }
    }
  } catch (error) {
    logger.error("Scheduled job failed", {
      cron: controller.cron,
      ...serializeError(error),
    })
  }
}
