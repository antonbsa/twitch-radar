import { Hono } from "hono";
import { Database } from "./db";
import type { Env, HonoEnv } from "./env";
import { ApiError, errorResponse } from "./http/errors";
import { getRequestId } from "./http/response";
import { handleHealth } from "./http/routes/health";

const app = new Hono<HonoEnv>();

app.use("*", (c, next) => {
  c.set("db", new Database(c.env.DB));
  return next();
});

app.options("/*", () => new Response(null, { status: 204 }));

app.get("/", (c) => c.json({ service: "twitch-radar-api" }));

app.get("/health", handleHealth);
app.get("/api/health", handleHealth);

app.notFound((c) => errorResponse(new ApiError(404, "not_found", "Route not found"), getRequestId(c.req.raw)));

app.onError((error, c) => errorResponse(error, getRequestId(c.req.raw)));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    console.log("Queue batch received", {
      queue: batch.queue,
      messages: batch.messages.length,
      environment: env.ENVIRONMENT ?? "local"
    });
  }
} satisfies ExportedHandler<Env>;
