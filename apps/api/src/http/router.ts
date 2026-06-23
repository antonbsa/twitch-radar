import { Database } from "../db/repositories";
import { type Env, loadConfig } from "../env";
import { ApiError, errorResponse, getRequestId, jsonResponse } from "./errors";

type Handler = (request: Request) => Promise<Response>;

export function createRouter(env: Env): Handler {
  return async (request: Request): Promise<Response> => {
    const requestId = getRequestId(request);

    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }

      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
        return handleHealth(env);
      }

      throw new ApiError(404, "not_found", "Route not found");
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

async function handleHealth(env: Env): Promise<Response> {
  const config = loadConfig(env);
  const db = new Database(env.DB);
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
