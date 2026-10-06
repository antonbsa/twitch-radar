import { Hono } from "hono"
import { Database } from "./db"
import { parseEnv, type HonoEnv } from "./env"
import { logger } from "./lib/logger"
import { ApiError, errorResponse } from "./http/errors"
import { authedRouter } from "./http/handlers"
import { requireAuth } from "./features/auth/middleware"
import { handleSearchCategories } from "./features/categories/routes"
import { handleGetFollowedChannels } from "./features/channels/routes"
import { handleHealth } from "./http/health"
import {
  handleGetMe,
  handleUpdateLanguage,
  handleUpdateNotificationsPaused,
} from "./features/me/routes"
import {
  handleAuthCallback,
  handleAuthStart,
  handleLogout,
} from "./features/auth/routes"
import {
  handleCreateBroadcasterMute,
  handleCreateNotificationSnooze,
  handleDeleteBroadcasterMute,
  handleListBroadcasterMutes,
  handleListNotificationSnoozes,
} from "./features/notifications/routes"
import {
  handleCreatePushSubscription,
  handleDeletePushSubscription,
  handleGetVapidPublicKey,
} from "./features/push/routes"
import {
  handleCreateChannelPreference,
  handleCreateGlobalPreference,
  handleCreateGlobalPreferenceExclusion,
  handleDeleteChannelPreference,
  handleDeleteGlobalPreference,
  handleDeleteGlobalPreferenceExclusion,
  handleGetPreferences,
} from "./features/preferences/routes"
import { handleSyncFollows } from "./features/channels/sync-routes"
import { handleEventsubWebhook } from "./features/eventsub/webhooks"
import { handleTestInspect } from "./http/test-seam/inspect"
import { handleTestReset } from "./http/test-seam/reset"
import { handleTestSeed } from "./http/test-seam/seed"
import { getRequestId } from "./http/response"

export function buildApp(includeTestSeam: boolean): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()

  app.use("*", (c, next) => {
    const config = parseEnv(c.env)
    logger.configure(config.environment)
    c.set("config", config)
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

  const me = authedRouter()
  me.get("/", handleGetMe)
  me.patch("/language", handleUpdateLanguage)
  me.patch("/notifications-paused", handleUpdateNotificationsPaused)
  api.route("/me", me)

  const sync = authedRouter()
  sync.post("/follows", handleSyncFollows)
  api.route("/sync", sync)

  const channels = authedRouter()
  channels.get("/followed", handleGetFollowedChannels)
  api.route("/channels", channels)

  const categories = authedRouter()
  categories.get("/search", handleSearchCategories)
  api.route("/categories", categories)

  const preferences = authedRouter()
  preferences.get("/", handleGetPreferences)
  preferences.post("/channel", handleCreateChannelPreference)
  preferences.delete("/channel/:id", handleDeleteChannelPreference)
  preferences.post("/global", handleCreateGlobalPreference)
  preferences.delete("/global/:id", handleDeleteGlobalPreference)
  preferences.post(
    "/global/:id/exclusions",
    handleCreateGlobalPreferenceExclusion,
  )
  preferences.delete(
    "/global/:id/exclusions/:exclusionId",
    handleDeleteGlobalPreferenceExclusion,
  )
  api.route("/preferences", preferences)

  const notifications = authedRouter()
  notifications.post("/snooze", handleCreateNotificationSnooze)
  notifications.get("/snoozes", handleListNotificationSnoozes)
  notifications.get("/mutes", handleListBroadcasterMutes)
  notifications.post("/mutes", handleCreateBroadcasterMute)
  notifications.delete("/mutes/:id", handleDeleteBroadcasterMute)
  api.route("/notifications", notifications)

  // Called by Twitch, not by users — authenticates via HMAC signature.
  api.post("/webhooks/twitch/eventsub", handleEventsubWebhook)

  const push = authedRouter()
  push.get("/vapid-public-key", handleGetVapidPublicKey)
  api.route("/push", push)

  const pushSubscriptions = authedRouter()
  pushSubscriptions.post("/", handleCreatePushSubscription)
  pushSubscriptions.delete("/:id", handleDeletePushSubscription)
  api.route("/push-subscriptions", pushSubscriptions)

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
