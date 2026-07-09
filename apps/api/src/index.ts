import { Hono } from "hono"
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
import type { TwitchEventQueueMessage } from "./types"
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
      // (replays are safe anyway — processing dedupes on message id).
      for (const message of batch.messages) {
        try {
          await processTwitchEventMessage(
            db,
            config,
            env.APP_CACHE,
            message.body as TwitchEventQueueMessage,
          )
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

    // twitch-radar-notification-jobs: consumer lands with T-008.
    console.log("Queue batch received", {
      queue: batch.queue,
      messages: batch.messages.length,
      environment: config.environment,
    })
  },

  // Creates Twitch-side subscriptions for staged pending rows (ADR 0031).
  // T-008 extends this into full EventSub reconciliation.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const config = parseEnv(env)
    const db = new Database(env.DB)
    await createPendingEventsubSubscriptions(db, config, env.APP_CACHE)
  },
} satisfies ExportedHandler<Env>
