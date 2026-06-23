import { Hono, type Context } from "hono";
import { createDatabaseClient } from "../db/client";
import { Database } from "../db/repositories";
import { type Env, loadConfig } from "../env";
import { ApiError, errorResponse, getRequestId, jsonResponse } from "./errors";

type HonoEnv = {
  Bindings: Env;
};

export function createApp(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.options("/*", () => new Response(null, { status: 204 }));

  app.get("/health", handleHealth);
  app.get("/api/health", handleHealth);

  app.notFound((c) => errorResponse(new ApiError(404, "not_found", "Route not found"), getRequestId(c.req.raw)));

  app.onError((error, c) => errorResponse(error, getRequestId(c.req.raw)));

  return app;
}

async function handleHealth(c: Context<HonoEnv>): Promise<Response> {
  const env = c.env;
  const config = loadConfig(env);
  const drizzleDb = createDatabaseClient(env.DB);
  const db = new Database(drizzleDb);
  const d1Probe = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

  if (d1Probe?.ok !== 1) {
    throw new ApiError(503, "database_unavailable", "Database health check failed");
  }

  return jsonResponse({
    ok: true,
    service: "twitch-radar-api",
    environment: config.environment,
    checks: {
      d1: "ok"
    },
    resources: {
      usersRepository: Boolean(db.users)
    }
  });
}
