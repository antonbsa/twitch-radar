import type { Hono } from "hono"
import { buildApp } from "./app"
import { Database } from "./db"
import { parseEnv, type Env, type HonoEnv } from "./env"
import { logger } from "./lib/logger"
import { consumeNotificationJobs } from "./queues/notification-jobs"
import { consumeTwitchEvents } from "./queues/twitch-events"
import { runScheduled } from "./scheduled"

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
    logger.configure(config.environment)
    const db = new Database(env.DB)

    // Match by prefix: each environment suffixes its queue name
    // ("-preview", "-dev"), and an exact match here previously made
    // preview's consumer silently ignore every batch.
    if (batch.queue.startsWith("twitch-radar-twitch-events")) {
      return consumeTwitchEvents(batch, db, config, env)
    }
    if (batch.queue.startsWith("twitch-radar-notification-jobs")) {
      return consumeNotificationJobs(batch, db, config)
    }

    logger.warn("Batch from unknown queue ignored", { queue: batch.queue })
  },

  scheduled: runScheduled,
} satisfies ExportedHandler<Env>
