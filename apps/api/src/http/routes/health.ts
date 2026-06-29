import type { Context } from "hono";
import type { HonoEnv } from "../../env";
import { loadConfig } from "../../env";
import { ApiError } from "../errors";
import { jsonResponse } from "../response";

export async function handleHealth(c: Context<HonoEnv>): Promise<Response> {
  const config = loadConfig(c.env);
  const d1Probe = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

  if (d1Probe?.ok !== 1) {
    throw new ApiError(503, "database_unavailable", "Database health check failed");
  }

  return jsonResponse({
    ok: true,
    service: "twitch-radar-api",
    environment: config.environment,
    checks: {
      d1: "ok"
    }
  });
}
