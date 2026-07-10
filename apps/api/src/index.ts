import { Hono } from "hono"
import {
  CRON_EVENTSUB_RECONCILE,
  CRON_FOLLOW_SYNC,
  CRON_TOKEN_REFRESH,
} from "./crons"
import { Database } from "./db"
import { parseEnv, type Env, type HonoEnv } from "./env"
import { ApiError, errorResponse } from "./http/errors"
import { requireAuth } from "./http/middleware/auth"
import { handleSearchCategories } from "./http/routes/categories"
import { handleGetFollowedChannels } from "./http/routes/channels"
import { handleHealth } from "./http/routes/health"
import { handleGetMe } from "./http/routes/me"
import {
  handleAuthCallback,
  handleAuthStart,
  handleLogout,
} from "./http/routes/auth"
import {
  handleCreatePushSubscription,
  handleDeletePushSubscription,
  handleGetVapidPublicKey,
} from "./http/routes/push-subscriptions"
import {
  handleCreateChannelPreference,
  handleCreateGlobalPreference,
  handleDeleteChannelPreference,
  handleDeleteGlobalPreference,
  handleGetPreferences,
} from "./http/routes/preferences"
import { handleSyncFollows } from "./http/routes/sync"
import { handleEventsubWebhook } from "./http/routes/webhooks"
import { createPendingEventsubSubscriptions } from "./services/eventsub/subscriptions"
import { processTwitchEventMessage } from "./services/eventsub/process"
import { reconcileEventsubSubscriptions } from "./services/eventsub/reconcile"
import { matchAndCreateDeliveries } from "./services/notifications/match"
import { deliverNotification } from "./services/notifications/deliver"
import { refreshExpiringTwitchTokens } from "./services/twitch/token-refresh"
import { syncStaleFollows } from "./services/twitch/sync"
import type { NotificationJobMessage, TwitchEventQueueMessage } from "./types"
import {
  handleTestInspect,
  handleTestReset,
  handleTestSeed,
} from "./http/routes/_tests"
import { getRequestId } from "./http/response"

function buildApp(includeTestSeam: boolean): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()

  app.use("*", (c, next) => {
    c.set("config", parseEnv(c.env))
    c.set("db", new Database(c.env.DB))
    return next()
  })

  app.options("/*", () => new Response(null, { status: 204 }))
  app.get("/", (c) => c.json({ service: "twitch-radar-api" }))
  app.get("/health", handleHealth)

  const api = new Hono<HonoEnv>()

  api.get("/health", handleHealth)
  api.get("/auth/twitch/start", handleAuthStart)
  api.get("/auth/twitch/callback", handleAuthCallback)
  api.post("/auth/logout", requireAuth, handleLogout)
  api.get("/me", requireAuth, handleGetMe)
  api.post("/sync/follows", requireAuth, handleSyncFollows)
  api.get("/channels/followed", requireAuth, handleGetFollowedChannels)
  api.get("/categories/search", requireAuth, handleSearchCategories)
  api.get("/preferences", requireAuth, handleGetPreferences)
  api.post("/preferences/channel", requireAuth, handleCreateChannelPreference)
  api.delete(
    "/preferences/channel/:id",
    requireAuth,
    handleDeleteChannelPreference,
  )
  api.post("/preferences/global", requireAuth, handleCreateGlobalPreference)
  api.delete(
    "/preferences/global/:id",
    requireAuth,
    handleDeleteGlobalPreference,
  )
  // Called by Twitch, not by users — authenticates via HMAC signature.
  api.post("/webhooks/twitch/eventsub", handleEventsubWebhook)
  api.get("/push/vapid-public-key", requireAuth, handleGetVapidPublicKey)
  api.post("/push-subscriptions", requireAuth, handleCreatePushSubscription)
  api.delete(
    "/push-subscriptions/:id",
    requireAuth,
    handleDeletePushSubscription,
  )

  app.route("/api", api)

  // Test-seam routes only exist on non-production builds of the app — there
  // is no per-request guard to bypass because the route is simply never
  // registered when running as production.
  if (includeTestSeam) {
    const testSeam = new Hono<HonoEnv>()
    testSeam.post("/reset", handleTestReset)
    testSeam.post("/seed", handleTestSeed)
    testSeam.post("/inspect", handleTestInspect)
    app.route("/api/__test__", testSeam)
  }

  app.notFound((c) => {
    const requestId = getRequestId(c.req.raw)
    const currentPath = new URL(c.req.url).pathname
    const pathExists = app.routes.some(
      (r) => r.path === currentPath && r.method !== "ALL",
    )
    if (pathExists) {
      return errorResponse(
        new ApiError(405, "method_not_allowed", "Method not allowed"),
        requestId,
      )
    }
    return errorResponse(
      new ApiError(404, "not_found", "Route not found"),
      requestId,
    )
  })
  app.onError((error, c) => errorResponse(error, getRequestId(c.req.raw)))

  return app
}

// `ENVIRONMENT` is a static binding for the life of an isolate, so which
// routes exist is decided once (on the first request) rather than per request.
let app: Hono<HonoEnv> | undefined

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!app) app = buildApp(parseEnv(env).environment !== "production")
    return app.fetch(request, env, ctx)
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const config = parseEnv(env)
    const db = new Database(env.DB)

    if (batch.queue === "twitch-radar-twitch-events") {
      // Ack/retry per message so one failure doesn't replay the whole batch
      // (replays are safe anyway — processing dedupes on message id and
      // matching dedupes on the delivery key).
      for (const message of batch.messages) {
        try {
          const change = await processTwitchEventMessage(
            db,
            config,
            env.APP_CACHE,
            message.body as TwitchEventQueueMessage,
          )
          if (change) {
            await matchAndCreateDeliveries(
              db,
              env.NOTIFICATION_JOBS_QUEUE,
              change,
            )
          }
          message.ack()
        } catch (error) {
          console.error("Twitch event processing failed", {
            messageId: (message.body as TwitchEventQueueMessage).messageId,
            error: error instanceof Error ? error.message : String(error),
          })
          message.retry()
        }
      }
      return
    }

    if (batch.queue === "twitch-radar-notification-jobs") {
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
          console.error("Notification job failed", {
            deliveryId: (message.body as NotificationJobMessage).deliveryId,
            error: error instanceof Error ? error.message : String(error),
          })
          message.retry()
        }
      }
      return
    }

    console.warn("Batch from unknown queue ignored", { queue: batch.queue })
  },

  // Cron fan-out (ADR 0036): each schedule owns one job so a slow or failing
  // job can't starve the others' subrequest budget, and tests can trigger
  // each in isolation via `/__scheduled?cron=...`. The default branch keeps
  // the minutely pending-subscription creation (ADR 0031).
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const config = parseEnv(env)
    const db = new Database(env.DB)

    switch (controller.cron) {
      case CRON_EVENTSUB_RECONCILE:
        return reconcileEventsubSubscriptions(db, config, env.APP_CACHE)
      case CRON_TOKEN_REFRESH:
        return refreshExpiringTwitchTokens(db, config)
      case CRON_FOLLOW_SYNC:
        return syncStaleFollows(db, config)
      default:
        return createPendingEventsubSubscriptions(db, config, env.APP_CACHE)
    }
  },
} satisfies ExportedHandler<Env>
