import { Hono } from "hono"
import { Database } from "./db"
import { parseEnv, type Env, type HonoEnv } from "./env"
import { ApiError, errorResponse } from "./http/errors"
import { requireAuth } from "./http/middleware/auth"
import { handleGetFollowedChannels } from "./http/routes/channels"
import { handleHealth } from "./http/routes/health"
import { handleGetMe } from "./http/routes/me"
import {
  handleAuthCallback,
  handleAuthStart,
  handleLogout,
} from "./http/routes/auth"
import { handleSyncFollows } from "./http/routes/sync"
import { getRequestId } from "./http/response"

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

app.route("/api", api)

app.notFound((c) =>
  errorResponse(
    new ApiError(404, "not_found", "Route not found"),
    getRequestId(c.req.raw),
  ),
)
app.onError((error, c) => errorResponse(error, getRequestId(c.req.raw)))

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const config = parseEnv(env)
    console.log("Queue batch received", {
      queue: batch.queue,
      messages: batch.messages.length,
      environment: config.environment,
    })
  },
} satisfies ExportedHandler<Env>
