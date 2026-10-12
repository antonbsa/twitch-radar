import * as Sentry from "@sentry/cloudflare"
import type { Hono } from "hono"
import { buildApp } from "./app"
import { Database } from "./db"
import { parseEnv, type Env, type HonoEnv } from "./env"
import {
  collectFailures,
  configureAlerting,
  sentryOptions,
} from "./lib/alerting"
import { logger } from "./lib/logger"
import { consumeNotificationJobs } from "./queues/notification-jobs"
import { consumeTwitchEvents } from "./queues/twitch-events"
import { runScheduled } from "./scheduled"

// Built once per isolate, on the first request, rather than per request.
let app: Hono<HonoEnv> | undefined

// withSentry covers fetch and queue and captures what escapes them; failures
// the code catches itself go through lib/alerting.ts (ADR 0047). `scheduled`
// stays outside it: the wrapper's fixed CPU per invocation exceeds the Free
// plan's 10ms cron budget, so alerting builds a Sentry client only on failure.
const instrumented = Sentry.withSentry(sentryOptions, {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!app) app = buildApp()
    return app.fetch(request, env, ctx)
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const config = parseEnv(env)
    logger.configure(config.environment)
    configureAlerting(config)
    const db = new Database(env.DB)

    // Match by prefix: each environment suffixes its queue name
    // ("-preview", "-dev"), and an exact match here previously made
    // preview's consumer silently ignore every batch.
    if (batch.queue.startsWith("twitch-radar-twitch-events")) {
      return collectFailures(() => consumeTwitchEvents(batch, db, config, env))
    }
    if (batch.queue.startsWith("twitch-radar-notification-jobs")) {
      return collectFailures(() => consumeNotificationJobs(batch, db, config))
    }

    logger.warn("Batch from unknown queue ignored", { queue: batch.queue })
  },
} satisfies ExportedHandler<Env>)

export default {
  ...instrumented,
  scheduled: (controller, env, ctx) =>
    collectFailures(() => runScheduled(controller, env), {
      controller,
      env,
      ctx,
    }),
} satisfies ExportedHandler<Env>
