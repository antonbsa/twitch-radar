import type { Context } from "hono"
import type { HonoEnv } from "../../env"

// Fixed identity so the reset/seed cycle is idempotent across runs. Broadcaster
// fixtures seeded by tests must use the E2E_BROADCASTER_PREFIX so reset() can
// find and remove them without touching any other broadcaster's shared state
// (channel_state is global across users, see ADR 0007).
export const E2E_USER_ID = "usr_e2e"
export const E2E_BROADCASTER_PREFIX = "e2e_bc_"

export async function readJsonBody<T>(c: Context<HonoEnv>): Promise<T> {
  return c.req.json<T>().catch(() => ({}) as T)
}
