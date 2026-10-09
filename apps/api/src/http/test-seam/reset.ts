import { eq, inArray, like } from "drizzle-orm"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { createDatabaseClient } from "../../db/client"
import {
  channelCategoryPreferences,
  channelState,
  channelStateChanges,
  eventsubSubscriptions,
  followedChannels,
  globalCategoryPreferences,
  monitoredChannels,
  notificationDeliveries,
  notificationSnoozes,
  pushSubscriptions,
  twitchTokens,
  users,
  broadcasterMutes,
  globalCategoryPreferenceExclusions,
} from "../../db/schema"
import { APP_TOKEN_KV_KEY } from "../../services/twitch/app-token"
import {
  deleteSession,
  deleteSessionsForUser,
} from "../../features/auth/session"
import { E2E_BROADCASTER_PREFIX, E2E_USER_ID, readJsonBody } from "./shared"

export interface ResetRequestBody {
  sessionId?: string
  // "e2e" (default) removes only the E2E user's rows and E2E-prefixed
  // broadcaster state, preserving any manually-created data in the same DB.
  // "all" wipes every table; it exists for the API test tier, which runs
  // against its own throwaway D1/KV state (tests/api/setup/ports.ts).
  scope?: "e2e" | "all"
}

const ALL_TABLES = [
  "global_category_preference_exclusions",
  "broadcaster_mutes",
  "notification_snoozes",
  "notification_deliveries",
  "global_category_preferences",
  "channel_category_preferences",
  "eventsub_subscriptions",
  "monitored_channels",
  "channel_state_changes",
  "channel_state",
  "category_box_art",
  "followed_channels",
  "push_subscriptions",
  "twitch_tokens",
  "users",
]

async function deleteAllSessions(kv: KVNamespace): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: "session:", cursor })
    for (const key of page.keys) await kv.delete(key.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}

export async function handleTestReset(c: Context<HonoEnv>): Promise<Response> {
  const body = await readJsonBody<ResetRequestBody>(c)

  // Revoking a single session (simulating mid-session expiry) never touches D1.
  if (body.sessionId) {
    await deleteSession(c.env.KV_APP_CACHE, body.sessionId)
    return new Response(null, { status: 204 })
  }

  if (body.scope === "all") {
    for (const table of ALL_TABLES) {
      await c.env.DB.prepare(`DELETE FROM ${table}`).run()
    }
    await deleteAllSessions(c.env.KV_APP_CACHE)
    // Evict the cached Twitch app token so each test mocks (and asserts) its
    // own client-credentials exchange deterministically.
    await c.env.KV_APP_CACHE.delete(APP_TOKEN_KV_KEY)
    return new Response(null, { status: 204 })
  }

  const db = createDatabaseClient(c.env.DB)
  // FK-dependent tables first, then users, then the broadcaster-keyed tables
  // (channel_state is monitored globally across users, see ADR 0007, so it's
  // scoped by the E2E_BROADCASTER_PREFIX convention instead of a user id).
  await db
    .delete(broadcasterMutes)
    .where(eq(broadcasterMutes.userId, E2E_USER_ID))
    .run()
  await db
    .delete(notificationSnoozes)
    .where(eq(notificationSnoozes.userId, E2E_USER_ID))
    .run()
  await db
    .delete(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, E2E_USER_ID))
    .run()
  await db
    .delete(channelCategoryPreferences)
    .where(eq(channelCategoryPreferences.userId, E2E_USER_ID))
    .run()
  await db
    .delete(globalCategoryPreferenceExclusions)
    .where(
      inArray(
        globalCategoryPreferenceExclusions.preferenceId,
        db
          .select({ id: globalCategoryPreferences.id })
          .from(globalCategoryPreferences)
          .where(eq(globalCategoryPreferences.userId, E2E_USER_ID)),
      ),
    )
    .run()
  await db
    .delete(globalCategoryPreferences)
    .where(eq(globalCategoryPreferences.userId, E2E_USER_ID))
    .run()
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, E2E_USER_ID))
    .run()
  await db
    .delete(twitchTokens)
    .where(eq(twitchTokens.userId, E2E_USER_ID))
    .run()
  await db
    .delete(followedChannels)
    .where(eq(followedChannels.userId, E2E_USER_ID))
    .run()
  await db.delete(users).where(eq(users.id, E2E_USER_ID)).run()
  await db
    .delete(channelState)
    .where(like(channelState.broadcasterUserId, `${E2E_BROADCASTER_PREFIX}%`))
    .run()
  await db
    .delete(monitoredChannels)
    .where(
      like(monitoredChannels.broadcasterUserId, `${E2E_BROADCASTER_PREFIX}%`),
    )
    .run()
  await db
    .delete(eventsubSubscriptions)
    .where(
      like(
        eventsubSubscriptions.broadcasterUserId,
        `${E2E_BROADCASTER_PREFIX}%`,
      ),
    )
    .run()
  await db
    .delete(channelStateChanges)
    .where(
      like(channelStateChanges.broadcasterUserId, `${E2E_BROADCASTER_PREFIX}%`),
    )
    .run()

  await deleteSessionsForUser(c.env.KV_APP_CACHE, E2E_USER_ID)

  return new Response(null, { status: 204 })
}
