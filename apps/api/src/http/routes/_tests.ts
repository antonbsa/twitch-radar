import { eq, like } from "drizzle-orm"
import { nanoid } from "nanoid"
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
  pushSubscriptions,
  twitchTokens,
  users,
} from "../../db/schema"
import { encryptToken } from "../../services/crypto"
import { APP_TOKEN_KV_KEY } from "../../services/twitch/app-token"
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  sessionCookieHeader,
} from "../../services/session"
import { jsonResponse } from "../response"

// Fixed identity so the reset/seed cycle is idempotent across runs. Broadcaster
// fixtures seeded by tests must use the E2E_BROADCASTER_PREFIX so reset() can
// find and remove them without touching any other broadcaster's shared state
// (channel_state is global across users, see ADR 0007).
export const E2E_USER_ID = "usr_e2e"
export const E2E_BROADCASTER_PREFIX = "e2e_bc_"

export interface SeedUserInput {
  id?: string
  twitchUserId?: string
  twitchLogin?: string
  twitchDisplayName?: string
  // When set, real (encrypted) rows land in twitch_tokens so token-refresh
  // paths can be exercised; expiredToken backdates expires_at.
  accessToken?: string
  refreshToken?: string
  expiredToken?: boolean
}

export interface SeedFollowedChannelInput {
  broadcasterUserId: string
  broadcasterLogin: string
  broadcasterDisplayName: string
  broadcasterProfileImageUrl?: string | null
  followedAt?: string | null
}

export interface SeedChannelStateInput {
  broadcasterUserId: string
  isLive: boolean
  streamId?: string | null
  categoryId?: string | null
  categoryName?: string | null
  title?: string | null
  viewerCount?: number | null
  startedAt?: string | null
}

export interface SeedPreferencesInput {
  channel?: {
    broadcasterUserId: string
    categoryId: string
    categoryName: string
  }[]
  global?: { categoryId: string; categoryName: string }[]
}

export interface SeedEventsubSubscriptionInput {
  broadcasterUserId: string
  eventType: string
  eventVersion?: string
  status?: string
  twitchSubscriptionId?: string | null
  callbackUrl?: string
}

export interface SeedMonitoredChannelInput {
  broadcasterUserId: string
  broadcasterLogin?: string
  broadcasterDisplayName?: string
  disabled?: boolean
}

export interface SeedPushSubscriptionInput {
  endpoint: string
  // Omitted keys are generated as a real P-256 point and 16-byte secret so
  // the Web Push encryption path works against them (ADR 0035).
  p256dh?: string
  auth?: string
  revoked?: boolean
}

export interface SeedRequestBody {
  user?: SeedUserInput
  followedChannels?: SeedFollowedChannelInput[]
  channelState?: SeedChannelStateInput[]
  preferences?: SeedPreferencesInput
  eventsubSubscriptions?: SeedEventsubSubscriptionInput[]
  monitoredChannels?: SeedMonitoredChannelInput[]
  pushSubscriptions?: SeedPushSubscriptionInput[]
}

export interface SeedResponse {
  userId: string
  session?: { sessionId: string; cookie: string }
}

async function readJsonBody<T>(c: Context<HonoEnv>): Promise<T> {
  return c.req.json<T>().catch(() => ({}) as T)
}

export async function handleTestSeed(c: Context<HonoEnv>): Promise<Response> {
  const body = await readJsonBody<SeedRequestBody>(c)
  const now = new Date().toISOString()
  const userId = body.user?.id ?? E2E_USER_ID

  let session: { sessionId: string; cookie: string } | undefined

  if (body.user) {
    await c.var.db.users.upsert({
      id: userId,
      twitchUserId: body.user.twitchUserId ?? "e2e_twitch_user",
      twitchLogin: body.user.twitchLogin ?? "e2e_login",
      twitchDisplayName: body.user.twitchDisplayName ?? "E2E Test User",
      now,
    })

    if (body.user.accessToken) {
      const expiresAt = body.user.expiredToken
        ? new Date(Date.now() - 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()

      await c.var.db.twitchTokens.upsert({
        userId,
        accessToken: await encryptToken(
          body.user.accessToken,
          c.var.config.tokenEncryptionKey,
        ),
        refreshToken: await encryptToken(
          body.user.refreshToken ?? "refresh-placeholder",
          c.var.config.tokenEncryptionKey,
        ),
        expiresAt,
        scopes: "user:read:follows",
        now,
      })
    }

    const sessionId = await createSession(c.env.KV_APP_CACHE, userId)
    session = { sessionId, cookie: sessionCookieHeader(sessionId) }
  }

  if (body.followedChannels?.length) {
    await c.var.db.followedChannels.upsertAll(
      body.followedChannels.map((channel) => ({
        userId,
        broadcasterUserId: channel.broadcasterUserId,
        broadcasterLogin: channel.broadcasterLogin,
        broadcasterDisplayName: channel.broadcasterDisplayName,
        broadcasterProfileImageUrl: channel.broadcasterProfileImageUrl ?? null,
        followedAt: channel.followedAt ?? null,
        now,
      })),
    )
  }

  if (body.channelState?.length) {
    await c.var.db.channelState.upsertAll(
      body.channelState.map((state) => ({
        broadcasterUserId: state.broadcasterUserId,
        isLive: state.isLive,
        streamId: state.streamId ?? null,
        categoryId: state.categoryId ?? null,
        categoryName: state.categoryName ?? null,
        title: state.title ?? null,
        viewerCount: state.viewerCount ?? null,
        startedAt: state.startedAt ?? null,
        now,
      })),
    )
  }

  if (body.preferences) {
    for (const pref of body.preferences.channel ?? []) {
      await c.var.db.channelCategoryPreferences.create({
        id: `cpref_${nanoid()}`,
        userId,
        broadcasterUserId: pref.broadcasterUserId,
        categoryId: pref.categoryId,
        categoryName: pref.categoryName,
        now,
      })
    }
    for (const pref of body.preferences.global ?? []) {
      await c.var.db.globalCategoryPreferences.create({
        id: `gpref_${nanoid()}`,
        userId,
        categoryId: pref.categoryId,
        categoryName: pref.categoryName,
        now,
      })
    }
  }

  if (body.eventsubSubscriptions?.length) {
    const db = createDatabaseClient(c.env.DB)
    for (const sub of body.eventsubSubscriptions) {
      await db
        .insert(eventsubSubscriptions)
        .values({
          id: `esub_${nanoid()}`,
          twitchSubscriptionId: sub.twitchSubscriptionId ?? null,
          broadcasterUserId: sub.broadcasterUserId,
          eventType: sub.eventType,
          eventVersion: sub.eventVersion ?? "1",
          status: sub.status ?? "pending",
          callbackUrl:
            sub.callbackUrl ??
            `${c.var.config.publicUrl}/api/webhooks/twitch/eventsub`,
          secretVersion: "1",
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  }

  if (body.monitoredChannels?.length) {
    await c.var.db.monitoredChannels.upsertAll(
      body.monitoredChannels.map((channel) => ({
        broadcasterUserId: channel.broadcasterUserId,
        broadcasterLogin: channel.broadcasterLogin ?? null,
        broadcasterDisplayName: channel.broadcasterDisplayName ?? null,
        monitorReason: "channel_preference",
        now,
      })),
    )
    for (const channel of body.monitoredChannels) {
      if (channel.disabled) {
        await c.var.db.monitoredChannels.disable(channel.broadcasterUserId, now)
      }
    }
  }

  if (body.pushSubscriptions?.length) {
    for (const subscription of body.pushSubscriptions) {
      const id = `psub_${nanoid()}`
      await c.var.db.pushSubscriptions.create({
        id,
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh ?? (await generateP256dhKey()),
        auth: subscription.auth ?? generateAuthSecret(),
        userAgent: null,
        now,
      })
      if (subscription.revoked) {
        await c.var.db.pushSubscriptions.revoke(id, now)
      }
    }
  }

  return jsonResponse({ userId, session } satisfies SeedResponse)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// A real (throwaway) P-256 public key — Web Push payload encryption performs
// actual ECDH against it, so a placeholder string would fail the send path.
async function generateP256dhKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey)
  return base64UrlEncode(new Uint8Array(raw))
}

function generateAuthSecret(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
}

export interface ResetRequestBody {
  sessionId?: string
  // "e2e" (default) removes only the E2E user's rows and E2E-prefixed
  // broadcaster state, preserving any manually-created data in the same DB.
  // "all" wipes every table; it exists for the API test tier, which runs
  // against its own throwaway D1/KV state (tests/api/setup/ports.ts).
  scope?: "e2e" | "all"
}

const ALL_TABLES = [
  "notification_deliveries",
  "global_category_preferences",
  "channel_category_preferences",
  "eventsub_subscriptions",
  "monitored_channels",
  "channel_state_changes",
  "channel_state",
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
    .delete(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, E2E_USER_ID))
    .run()
  await db
    .delete(channelCategoryPreferences)
    .where(eq(channelCategoryPreferences.userId, E2E_USER_ID))
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

export interface InspectRequestBody {
  broadcasterUserIds: string[]
  // When set, the response also carries this user's push subscriptions
  // (user-keyed, unlike everything else here).
  userId?: string
}

// Read-only window into broadcaster-keyed tables the public API never
// exposes (monitoring is server-internal, ADR 0007) so tests can assert
// monitored_channels / eventsub_subscriptions / channel_state /
// notification_deliveries side effects.
export async function handleTestInspect(
  c: Context<HonoEnv>,
): Promise<Response> {
  const body = await readJsonBody<InspectRequestBody>(c)
  const ids = body.broadcasterUserIds ?? []

  const [monitored, eventsub, state, stateChanges, deliveries, pushSubs] =
    await Promise.all([
      c.var.db.monitoredChannels.findByBroadcasterUserIds(ids),
      c.var.db.eventsubSubscriptions.findByBroadcasterUserIds(ids),
      c.var.db.channelState.findByBroadcasterUserIds(ids),
      c.var.db.channelStateChanges.findByBroadcasterUserIds(ids),
      c.var.db.notificationDeliveries.findByBroadcasterUserIds(ids),
      body.userId
        ? c.var.db.pushSubscriptions.listByUserId(body.userId)
        : Promise.resolve([]),
    ])

  return jsonResponse({
    monitoredChannels: monitored,
    eventsubSubscriptions: eventsub,
    channelState: state,
    channelStateChanges: stateChanges,
    notificationDeliveries: deliveries,
    pushSubscriptions: pushSubs,
  })
}
