import { createSeamClient } from "../../shared/seam-client"
import type { SeedUserInput } from "../../shared/seam-client"
import { API_TEST_URL, MOCK_TWITCH_URL } from "./ports"

const seam = createSeamClient({ baseUrl: () => API_TEST_URL })

/** Full wipe of tables + sessions — safe because this tier's worker runs against throwaway D1/KV state. */
async function clearDatabase() {
  await seam.resetAll()
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
}

export const orchestrator = {
  baseUrl: API_TEST_URL,
  clearDatabase,
  createAuthenticatedSession,
  mockTwitch,
}
