import {
  PERIODIC_JOB_MINUTES,
  type PeriodicJobName,
} from "../../../apps/api/src/crons"
import { createSeamClient } from "../../shared/seam-client"
import type { SeedUserInput } from "../../shared/seam-client"
import { API_TEST_URL, MOCK_TWITCH_URL } from "./ports"

const seam = createSeamClient({ baseUrl: () => API_TEST_URL })

/** Full wipe of tables + sessions — safe because this tier's worker runs against throwaway D1/KV state. */
async function clearDatabase() {
  await seam.resetAll()
}

async function seedFollowedChannels(
  userId: string,
  channels: Array<{
    broadcasterUserId: string
    broadcasterLogin: string
    broadcasterDisplayName: string
  }>,
) {
  // The seam attaches followedChannels to the user in the same request, and
  // seeding a user upserts it — derive twitchUserId from the id so re-seeds
  // stay collision-free on the users.twitch_user_id unique constraint.
  await seam.seed({
    user: { id: userId, twitchUserId: `twitch_${userId}` },
    followedChannels: channels,
  })
}

async function createAuthenticatedSession(options: SeedUserInput = {}) {
  const seeded = await seam.seedAuthenticatedUser({
    twitchUserId: options.twitchUserId ?? "twitch_test_123",
    twitchLogin: options.twitchLogin ?? "testuser",
    twitchDisplayName: options.twitchDisplayName ?? "TestUser",
    accessToken: options.accessToken ?? "valid-access-token",
    refreshToken: options.refreshToken ?? "valid-refresh-token",
    expiredToken: options.expiredToken ?? false,
    tokenValidatedAt: options.tokenValidatedAt,
    undecryptableToken: options.undecryptableToken,
    refreshLockedUntil: options.refreshLockedUntil,
    sessionTtlS: options.sessionTtlS,
    sessionMaxLifetimeS: options.sessionMaxLifetimeS,
    ...(options.id ? { id: options.id } : {}),
  })
  // seeded.cookie is a full Set-Cookie string; requests need only the pair.
  return {
    cookie: `session=${seeded.sessionId}`,
    userId: seeded.userId,
  }
}

const mockTwitch = {
  async queue(
    pathPattern: string,
    body: unknown,
    status = 200,
    headers?: Record<string, string>,
  ) {
    const res = await fetch(`${MOCK_TWITCH_URL}/__mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathPattern, body, status, headers }),
    })
    if (!res.ok) throw new Error(`mockTwitch.queue failed: ${res.status}`)
  },

  async reset() {
    await fetch(`${MOCK_TWITCH_URL}/__mock`, { method: "DELETE" })
  },

  /** Paths (with query) of the mocked calls answered since the last reset. */
  async requests(): Promise<string[]> {
    const res = await fetch(`${MOCK_TWITCH_URL}/__mock/requests`)
    return (await res.json()) as string[]
  },

  onTokenExchange(body: unknown, status = 200) {
    return this.queue("/oauth2/token", body, status)
  },

  /** `/oauth2/validate`: 200 for a valid token, 401 for an invalid or expired one. */
  onTokenValidate(status = 200) {
    return this.queue("/oauth2/validate", { message: "validate" }, status)
  },

  onUserInfo(body: unknown, status = 200) {
    return this.queue("/helix/users", body, status)
  },

  /** Get Users by id (avatar lookup); one call per chunk of up to 100 ids. */
  onUsersByIds(
    users: Array<{ id: string; profile_image_url: string }>,
    status = 200,
  ) {
    // "?id=" keeps this apart from onUserInfo's id-less /helix/users call.
    return this.queue(
      "/helix/users?id=",
      {
        data: users.map((u) => ({
          ...u,
          login: `login_${u.id}`,
          display_name: `Name_${u.id}`,
        })),
      },
      status,
    )
  },

  onFollowedChannels(
    channels: Array<{
      broadcaster_id: string
      broadcaster_login: string
      broadcaster_name: string
    }>,
    cursor?: string,
  ) {
    return this.queue("/helix/channels/followed", {
      data: channels.map((ch) => ({
        ...ch,
        followed_at: "2024-01-01T00:00:00Z",
      })),
      pagination: cursor ? { cursor } : {},
    })
  },

  onFollowedStreams(
    streams: Array<{
      id: string
      user_id: string
      user_login: string
      user_name: string
      game_id: string
      game_name: string
      viewer_count: number
      started_at: string
      title: string
      thumbnail_url?: string
    }>,
  ) {
    return this.queue("/helix/streams/followed", {
      data: streams.map((s) => ({ ...s, type: "live" })),
      pagination: {},
    })
  },

  onCategorySearch(
    categories: Array<{
      id: string
      name: string
      box_art_url?: string | null
    }>,
    status = 200,
  ) {
    return this.queue("/helix/search/categories", { data: categories }, status)
  },

  onStreams(
    streams: Array<{
      id: string
      user_id: string
      user_login: string
      user_name: string
      game_id: string
      game_name: string
      viewer_count: number
      started_at: string
      title: string
      thumbnail_url?: string
      // Defaults to "live" — override to exercise non-live suppression
      // (issue #38 item 1).
      type?: string
    }>,
  ) {
    // The "?" keeps this pattern from also matching /helix/streams/followed
    // requests (the mock server routes on URL substring containment).
    return this.queue("/helix/streams?", {
      data: streams.map((s) => ({ ...s, type: s.type ?? "live" })),
    })
  },

  /** Client-credentials exchange (same /oauth2/token path as the user grant). */
  onAppToken(accessToken = "app-access-token") {
    return this.queue("/oauth2/token", {
      access_token: accessToken,
      expires_in: 3600,
      token_type: "bearer",
    })
  },

  onEventsubSubscriptionCreate(
    twitchSubscriptionId: string,
    status = "webhook_callback_verification_pending",
    httpStatus = 202,
  ) {
    return this.queue(
      "/helix/eventsub/subscriptions",
      { data: [{ id: twitchSubscriptionId, status }] },
      httpStatus,
    )
  },

  // The GET list call always carries first=100 (also what keeps its pattern
  // distinct from the POST create above on the substring-matching mock).
  onEventsubSubscriptionList(
    subscriptions: Array<{
      id: string
      status: string
      type: string
      version?: string
      broadcaster_user_id: string
      callback: string
    }>,
  ) {
    return this.queue("/helix/eventsub/subscriptions?first", {
      data: subscriptions.map((sub) => ({
        id: sub.id,
        status: sub.status,
        type: sub.type,
        version: sub.version ?? "1",
        condition: { broadcaster_user_id: sub.broadcaster_user_id },
        transport: { method: "webhook", callback: sub.callback },
      })),
      pagination: {},
    })
  },

  onEventsubSubscriptionDelete(status = 204) {
    return this.queue("/helix/eventsub/subscriptions?id=", {}, status)
  },

  /**
   * Queues a response for a Web Push send. The push endpoint itself is a URL
   * on the mock server (tests seed subscriptions pointing at it), so `path`
   * is whatever suffix the test chose for that subscription.
   */
  onPush(path: string, status = 201) {
    return this.queue(path, {}, status)
  },
}

/** Push endpoint URL on the mock server for a seeded subscription. */
function pushEndpoint(path: string) {
  return `${MOCK_TWITCH_URL}${path}`
}

/**
 * Triggers the worker's `scheduled()` handler through Miniflare's
 * `/cdn-cgi/local/scheduled` endpoint (wrangler's `/__scheduled` drops
 * `time`); resolves after the handler completes. The handler picks jobs from
 * the scheduled time (ADR 0057), so `job` pins the time to that job's first
 * UTC minute; without it the time falls on a minute with only the minutely
 * jobs due, regardless of when the test runs.
 */
async function runScheduled(job?: PeriodicJobName) {
  const minute = job ? PERIODIC_JOB_MINUTES[job][0] : 1
  const time = Date.UTC(2026, 0, 2, 12, minute)
  const res = await fetch(
    `${API_TEST_URL}/cdn-cgi/local/scheduled?time=${time}`,
  )
  if (!res.ok) throw new Error(`Scheduled trigger failed: ${res.status}`)
}

/**
 * Polls the inspect seam until `predicate` passes — queue consumers process
 * webhook events asynchronously, so state assertions must wait.
 */
async function waitForInspect(
  broadcasterUserIds: string[],
  predicate: (state: Awaited<ReturnType<typeof seam.inspect>>) => boolean,
  options: { timeoutMs?: number; userId?: string } = {},
) {
  const { timeoutMs = 10_000, userId } = options
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const state = await seam.inspect(broadcasterUserIds, userId)
    if (predicate(state)) return state
    if (Date.now() > deadline) {
      throw new Error(
        `waitForInspect timed out after ${timeoutMs}ms: ${JSON.stringify(state)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

interface FollowedChannelListItem {
  broadcaster_user_id: string
  is_live: boolean
  viewer_count: number | null
  [key: string]: unknown
}

/**
 * Polls `GET /channels/followed` until `predicate` passes — `POST
 * /sync/follows` defers its D1 writes behind `waitUntil` (issue #83), so a
 * test asserting on persisted state right after a sync must wait for it
 * rather than assume it already landed.
 */
async function waitForFollowedChannels(
  cookie: string,
  predicate: (data: FollowedChannelListItem[]) => boolean,
  options: { timeoutMs?: number } = {},
): Promise<FollowedChannelListItem[]> {
  const { timeoutMs = 10_000 } = options
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await fetch(`${API_TEST_URL}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    const { data } = (await res.json()) as { data: FollowedChannelListItem[] }
    if (predicate(data)) return data
    if (Date.now() > deadline) {
      throw new Error(
        `waitForFollowedChannels timed out after ${timeoutMs}ms: ${JSON.stringify(data)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export const orchestrator = {
  baseUrl: API_TEST_URL,
  clearDatabase,
  createAuthenticatedSession,
  seed: seam.seed,
  seedFollowedChannels,
  seedChannelState: seam.seedChannelState,
  seedEventsubSubscriptions: seam.seedEventsubSubscriptions,
  seedNotificationSnoozes: seam.seedNotificationSnoozes,
  inspect: (broadcasterUserIds: string[], userId?: string) =>
    seam.inspect(broadcasterUserIds, userId),
  runScheduled,
  waitForInspect,
  waitForFollowedChannels,
  mockTwitch,
  pushEndpoint,
}
