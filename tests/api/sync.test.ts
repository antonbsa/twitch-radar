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
})
