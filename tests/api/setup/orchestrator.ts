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
    ...(options.id ? { id: options.id } : {}),
  })
  // seeded.cookie is a full Set-Cookie string; requests need only the pair.
  return {
    cookie: `session=${seeded.sessionId}`,
    userId: seeded.userId,
  }
}

const mockTwitch = {
  async queue(pathPattern: string, body: unknown, status = 200) {
    const res = await fetch(`${MOCK_TWITCH_URL}/__mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathPattern, body, status }),
    })
    if (!res.ok) throw new Error(`mockTwitch.queue failed: ${res.status}`)
  },

  async reset() {
    await fetch(`${MOCK_TWITCH_URL}/__mock`, { method: "DELETE" })
  },

  onTokenExchange(body: unknown, status = 200) {
    return this.queue("/oauth2/token", body, status)
  },

  onUserInfo(body: unknown, status = 200) {
    return this.queue("/helix/users", body, status)
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
    }>,
  ) {
    // The "?" keeps this pattern from also matching /helix/streams/followed
    // requests (the mock server routes on URL substring containment).
    return this.queue("/helix/streams?", {
      data: streams.map((s) => ({ ...s, type: "live" })),
    })
  },

  // Client-credentials exchange (same /oauth2/token path as the user grant).
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
}

/**
 * Triggers the worker's `scheduled()` handler through wrangler dev's
 * `--test-scheduled` endpoint; resolves after the handler completes.
 */
async function runScheduled() {
  const res = await fetch(`${API_TEST_URL}/__scheduled`)
  if (!res.ok) throw new Error(`Scheduled trigger failed: ${res.status}`)
}

/**
 * Polls the inspect seam until `predicate` passes — queue consumers process
 * webhook events asynchronously, so state assertions must wait.
 */
async function waitForInspect(
  broadcasterUserIds: string[],
  predicate: (state: Awaited<ReturnType<typeof seam.inspect>>) => boolean,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const state = await seam.inspect(broadcasterUserIds)
    if (predicate(state)) return state
    if (Date.now() > deadline) {
      throw new Error(
        `waitForInspect timed out after ${timeoutMs}ms: ${JSON.stringify(state)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export const orchestrator = {
  baseUrl: API_TEST_URL,
  clearDatabase,
  createAuthenticatedSession,
  seedFollowedChannels,
  seedChannelState: seam.seedChannelState,
  seedEventsubSubscriptions: seam.seedEventsubSubscriptions,
  inspect: (broadcasterUserIds: string[]) => seam.inspect(broadcasterUserIds),
  runScheduled,
  waitForInspect,
  mockTwitch,
}
