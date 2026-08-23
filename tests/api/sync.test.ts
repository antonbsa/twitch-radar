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
    await expect(res.json()).resolves.toMatchObject({ ok: true })

    const channelsRes = await fetch(
      `${orchestrator.baseUrl}/api/channels/followed`,
      {
        headers: { Cookie: cookie },
      },
    )
    const { data } = (await channelsRes.json()) as {
      data: Array<{
        broadcaster_user_id: string
        is_live: boolean
        viewer_count: number | null
      }>
    }

    expect(data).toHaveLength(2)
    const a = data.find((c) => c.broadcaster_user_id === "100")!
    const b = data.find((c) => c.broadcaster_user_id === "200")!
    expect(a.is_live).toBe(true)
    expect(a.viewer_count).toBe(1000)
    expect(b.is_live).toBe(false)
    expect(b.viewer_count).toBeNull()
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

    const channelsRes = await fetch(
      `${orchestrator.baseUrl}/api/channels/followed`,
      {
        headers: { Cookie: cookie },
      },
    )
    const { data } = (await channelsRes.json()) as { data: unknown[] }
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

    const channelsRes = await fetch(
      `${orchestrator.baseUrl}/api/channels/followed`,
      { headers: { Cookie: cookie } },
    )
    const { data } = (await channelsRes.json()) as {
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

    const channelsRes2 = await fetch(
      `${orchestrator.baseUrl}/api/channels/followed`,
      { headers: { Cookie: cookie } },
    )
    const { data: data2 } = (await channelsRes2.json()) as {
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
  }, 30_000)
})
