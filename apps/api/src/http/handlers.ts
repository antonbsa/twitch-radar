import { Hono, type Context } from "hono"
import { matchedRoutes } from "hono/route"
import type { z } from "zod"
import type { HonoEnv } from "../env"
import { ApiError } from "./errors"
import { requireAuth } from "./middleware/auth"

/**
 * Reads the JSON body and validates it against `schema`; a missing, malformed
 * or invalid body throws `400 invalid_request` with `message`.
 */
export async function parseBody<S extends z.ZodType>(
  c: Context<HonoEnv>,
  schema: S,
  message: string,
): Promise<z.infer<S>> {
  const body = await c.req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", message)
  }
  return parsed.data
}

/**
 * Looks up the `:id` path param with `find` and returns the record only when
 * the authenticated user owns it; otherwise throws `404 not_found`, so a record
 * owned by someone else is indistinguishable from a missing one.
 */
export async function findOwnedRecord<T extends { user_id: string }>(
  c: Context<HonoEnv>,
  find: (id: string) => Promise<T | null>,
  notFoundMessage: string,
): Promise<T> {
  const id = c.req.param("id")
  const record = id ? await find(id) : null
  if (!record || record.user_id !== c.var.userId) {
    throw new ApiError(404, "not_found", notFoundMessage)
  }
  return record
}

/**
 * A route group whose every route requires a session. Mount it on a prefix so
 * the guard covers only that group's paths, not the public routes beside it.
 * The guard is skipped when no route matches the method, so a wrong method on
 * a known path still reaches the 405 handler instead of failing auth first.
 */
export function authedRouter(): Hono<HonoEnv> {
  const router = new Hono<HonoEnv>()
  router.use((c, next) =>
    matchedRoutes(c).some((route) => route.method !== "ALL")
      ? requireAuth(c, next)
      : next(),
  )
  return router
}
