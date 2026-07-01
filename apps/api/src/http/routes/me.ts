import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"

export async function handleGetMe(c: Context<HonoEnv>): Promise<Response> {
  const user = await c.var.db.users.findById(c.var.userId)
  if (!user) throw new ApiError(404, "user_not_found", "User not found")
  return jsonResponse({ data: user })
}
