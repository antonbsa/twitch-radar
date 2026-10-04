import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

const CHANNEL_A = {
  broadcaster_id: "100",
  broadcaster_login: "channela",
  broadcaster_name: "ChannelA",
}
const CHANNEL_B = {
  broadcaster_id: "200",
  broadcaster_login: "channelb",
  broadcaster_name: "ChannelB",
}
const STREAM_A = {
  id: "stream_1",
  user_id: "100",
  user_login: "channela",
  user_name: "ChannelA",
  game_id: "game_1",
  game_name: "Minecraft",
  viewer_count: 1000,
  started_at: "2024-06-01T12:00:00Z",
  title: "Playing Minecraft",
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("POST /api/sync/follows", () => {
  it("should sync followed channels and live stream state", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A, CHANNEL_B])
    await orchestrator.mockTwitch.onFollowedStreams([STREAM_A])

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: Array<{
        broadcaster_user_id: string
        is_live: boolean
        viewer_count: number | null
      }>
    }

    // The response is the synced channel list itself (issue #83) — no
    // second round trip to GET /channels/followed needed to see it.
    expect(data).toHaveLength(2)
    const a = data.find((c) => c.broadcaster_user_id === "100")!
    const b = data.find((c) => c.broadcaster_user_id === "200")!
    expect(a.is_live).toBe(true)
    expect(a.viewer_count).toBe(1000)
    expect(b.is_live).toBe(false)
    expect(b.viewer_count).toBeNull()

    // The D1 writes run deferred (waitUntil) after the response above — poll
    // until they land to confirm they still happen, just not synchronously.
    await orchestrator.waitForFollowedChannels(
      cookie,
      (items) => items.length === 2,
    )
  })

  it("should handle Twitch pagination across multiple pages", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onFollowedChannels(
      [CHANNEL_A],
      "cursor-page-2",
    )
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_B])
    await orchestrator.mockTwitch.onFollowedStreams([])

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: unknown[] }
    expect(data).toHaveLength(2)
  })

  it("should refresh an expired token before syncing", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      accessToken: "expired-token",
      refreshToken: "valid-refresh-token",
      expiredToken: true,
    })

    await orchestrator.mockTwitch.onTokenExchange({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 14400,
      scope: ["user:read:follows"],
      token_type: "bearer",
    })
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A])
    await orchestrator.mockTwitch.onFollowedStreams([])

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
  })

  it("should return 401 reconnect_required when token refresh fails", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      accessToken: "expired-token",
      refreshToken: "bad-refresh-token",
      expiredToken: true,
    })

    await orchestrator.mockTwitch.onTokenExchange(
      { error: "invalid_grant" },
      401,
    )

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })

    // Retrying with valid credentials right after a failed refresh should
    // succeed.
    await orchestrator.mockTwitch.onTokenExchange({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 14400,
      scope: ["user:read:follows"],
      token_type: "bearer",
    })
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A])
    await orchestrator.mockTwitch.onFollowedStreams([])

    const retry = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(retry.status).toBe(200)
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
    })
    expect(res.status).toBe(401)
  })

  it("should batch a large followed list across multiple chunks and stay idempotent on retry", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    // Large enough to require multiple batches under followedChannels'
    // 8-rows-per-chunk and channelState's 10-rows-per-chunk limits, so this
    // exercises both the multi-row upsert and the single db.batch() call
    // per repository instead of just a single chunk.
    const BROADCASTER_COUNT = 40
    const channels = Array.from({ length: BROADCASTER_COUNT }, (_, i) => ({
      broadcaster_id: `${5000 + i}`,
      broadcaster_login: `channel${i}`,
      broadcaster_name: `Channel${i}`,
    }))
    await orchestrator.mockTwitch.onFollowedChannels(channels)
    await orchestrator.mockTwitch.onFollowedStreams([
      {
        id: "stream_1",
        user_id: channels[0].broadcaster_id,
        user_login: channels[0].broadcaster_login,
        user_name: channels[0].broadcaster_name,
        game_id: "game_1",
        game_name: "Minecraft",
        viewer_count: 500,
        started_at: "2024-06-01T12:00:00Z",
        title: "Live now",
      },
    ])

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: Array<{
        broadcaster_user_id: string
        broadcaster_display_name: string
        is_live: boolean
        viewer_count: number | null
      }>
    }
    expect(data).toHaveLength(BROADCASTER_COUNT)
    const live = data.filter((c) => c.is_live)
    expect(live).toHaveLength(1)
    expect(live[0]!.broadcaster_user_id).toBe(channels[0]!.broadcaster_id)
    expect(live[0]!.viewer_count).toBe(500)

    // The D1 writes above are deferred (waitUntil) — wait for them to land
    // before re-syncing, otherwise the second sync's writes could race the
    // first's and make the idempotency assertion below flaky.
    await orchestrator.waitForFollowedChannels(
      cookie,
      (items) => items.length === BROADCASTER_COUNT,
    )

    // Re-sync with refreshed display names and the stream now offline — a
    // repeat run over the same broadcasters must refresh rows in place
    // (unchanged count, updated fields), not error or duplicate, including
    // with followedChannels.upsertAll and channelState.upsertAll now
    // running concurrently via Promise.all.
    const updatedChannels = channels.map((ch) => ({
      ...ch,
      broadcaster_name: `${ch.broadcaster_name}Updated`,
    }))
    await orchestrator.mockTwitch.reset()
    await orchestrator.mockTwitch.onFollowedChannels(updatedChannels)
    await orchestrator.mockTwitch.onFollowedStreams([])

    const res2 = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(res2.status).toBe(200)
    const { data: data2 } = (await res2.json()) as {
      data: Array<{
        broadcaster_user_id: string
        broadcaster_display_name: string
        is_live: boolean
      }>
    }
    expect(data2).toHaveLength(BROADCASTER_COUNT)
    expect(data2.every((c) => !c.is_live)).toBe(true)
    const first = data2.find(
      (c) => c.broadcaster_user_id === channels[0]!.broadcaster_id,
    )!
    expect(first.broadcaster_display_name).toBe(
      `${channels[0]!.broadcaster_name}Updated`,
    )

    // Confirm the second sync's deferred writes also land, refreshing the
    // display name persisted from the first run rather than duplicating it.
    const persisted = await orchestrator.waitForFollowedChannels(
      cookie,
      (items) =>
        items.length === BROADCASTER_COUNT &&
        items.every((c) => !c.is_live) &&
        items.some(
          (c) =>
            c.broadcaster_user_id === channels[0]!.broadcaster_id &&
            c.broadcaster_display_name ===
              `${channels[0]!.broadcaster_name}Updated`,
        ),
    )
    expect(persisted).toHaveLength(BROADCASTER_COUNT)
  }, 30_000)
})

describe("POST /api/sync/follows broadcaster avatars", () => {
  const AVATAR_A = "https://static-cdn.jtvnw.net/a-300x300.png"
  const AVATAR_B = "https://static-cdn.jtvnw.net/b-300x300.png"

  async function syncFollows(cookie: string) {
    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: Array<{
        broadcaster_user_id: string
        broadcaster_profile_image_url: string | null
      }>
    }
    return new Map(
      data.map((c) => [c.broadcaster_user_id, c.broadcaster_profile_image_url]),
    )
  }

  it("should return and persist avatars fetched from Get Users", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A, CHANNEL_B])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await orchestrator.mockTwitch.onUsersByIds([
      { id: "100", profile_image_url: AVATAR_A },
      { id: "200", profile_image_url: AVATAR_B },
    ])

    const avatars = await syncFollows(cookie)
    expect(avatars.get("100")).toBe(AVATAR_A)
    expect(avatars.get("200")).toBe(AVATAR_B)

    await orchestrator.waitForFollowedChannels(
      cookie,
      (items) =>
        items.length === 2 &&
        items.every(
          (c) =>
            c.broadcaster_profile_image_url ===
            (c.broadcaster_user_id === "100" ? AVATAR_A : AVATAR_B),
        ),
    )
  })

  it("should keep stored avatars and only look up new follows", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await orchestrator.mockTwitch.onUsersByIds([
      { id: "100", profile_image_url: AVATAR_A },
    ])
    await syncFollows(cookie)
    await orchestrator.waitForFollowedChannels(cookie, (items) =>
      items.some((c) => c.broadcaster_profile_image_url === AVATAR_A),
    )

    // Stored avatars are not re-fetched on every sync.
    await orchestrator.mockTwitch.reset()
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A, CHANNEL_B])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await orchestrator.mockTwitch.onUsersByIds([
      { id: "200", profile_image_url: AVATAR_B },
    ])

    const avatars = await syncFollows(cookie)
    expect(avatars.get("100")).toBe(AVATAR_A)
    expect(avatars.get("200")).toBe(AVATAR_B)
    const userLookups = (await orchestrator.mockTwitch.requests()).filter(
      (url) => url.startsWith("/helix/users?"),
    )
    expect(userLookups).toEqual(["/helix/users?id=200"])
  })

  it("should still sync when the avatar lookup fails", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL_A])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await orchestrator.mockTwitch.onUsersByIds([], 500)

    const avatars = await syncFollows(cookie)
    expect(avatars.get("100")).toBeNull()
    await orchestrator.waitForFollowedChannels(
      cookie,
      (items) => items.length === 1,
    )
  })

  it("should chunk the avatar lookup at 100 ids per Get Users call", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const channels = Array.from({ length: 150 }, (_, i) => ({
      broadcaster_id: `${7000 + i}`,
      broadcaster_login: `channel${i}`,
      broadcaster_name: `Channel${i}`,
    }))
    await orchestrator.mockTwitch.onFollowedChannels(channels)
    await orchestrator.mockTwitch.onFollowedStreams([])
    const users = channels.map((ch) => ({
      id: ch.broadcaster_id,
      profile_image_url: `https://example.test/${ch.broadcaster_id}.png`,
    }))
    // The mock answers each request with whatever is queued, so a single
    // unchunked call would consume the first entry and leave 50 ids blank.
    await orchestrator.mockTwitch.onUsersByIds(users.slice(0, 100))
    await orchestrator.mockTwitch.onUsersByIds(users.slice(100))

    const avatars = await syncFollows(cookie)
    expect(avatars.size).toBe(150)
    for (const user of users) {
      expect(avatars.get(user.id)).toBe(user.profile_image_url)
    }
  }, 30_000)
})
