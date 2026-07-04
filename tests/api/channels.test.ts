import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

async function syncChannels(
  cookie: string,
  channels: Array<{
    broadcaster_id: string
    broadcaster_login: string
    broadcaster_name: string
  }>,
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
  }> = [],
) {
  await orchestrator.mockTwitch.onFollowedChannels(channels)
  await orchestrator.mockTwitch.onFollowedStreams(streams)
  await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
    method: "POST",
    headers: { Cookie: cookie },
  })
}

describe("GET /api/channels/followed", () => {
  it("returns 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`)
    expect(res.status).toBe(401)
  })

  it("returns empty array when no channels are synced", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: [] })
  })

  it("returns live channels before offline channels", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await syncChannels(
      cookie,
      [
        {
          broadcaster_id: "10",
          broadcaster_login: "offline1",
          broadcaster_name: "Offline1",
        },
        {
          broadcaster_id: "20",
          broadcaster_login: "live1",
          broadcaster_name: "Live1",
        },
      ],
      [
        {
          id: "s1",
          user_id: "20",
          user_login: "live1",
          user_name: "Live1",
          game_id: "g1",
          game_name: "Game",
          viewer_count: 500,
          started_at: "2024-06-01T10:00:00Z",
          title: "Live now",
        },
      ],
    )

    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    const { data } = (await res.json()) as {
      data: Array<{ broadcaster_user_id: string; is_live: boolean }>
    }

    expect(data[0].broadcaster_user_id).toBe("20")
    expect(data[0].is_live).toBe(true)
    expect(data[1].broadcaster_user_id).toBe("10")
    expect(data[1].is_live).toBe(false)
  })

  it("sorts live channels by viewer count descending", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const makeStream = (
      id: string,
      userId: string,
      login: string,
      name: string,
      viewerCount: number,
    ) => ({
      id,
      user_id: userId,
      user_login: login,
      user_name: name,
      game_id: "g1",
      game_name: "Game",
      viewer_count: viewerCount,
      started_at: "2024-06-01T10:00:00Z",
      title: "Title",
    })

    await syncChannels(
      cookie,
      [
        {
          broadcaster_id: "10",
          broadcaster_login: "lowviewer",
          broadcaster_name: "LowViewer",
        },
        {
          broadcaster_id: "20",
          broadcaster_login: "highviewer",
          broadcaster_name: "HighViewer",
        },
        {
          broadcaster_id: "30",
          broadcaster_login: "midviewer",
          broadcaster_name: "MidViewer",
        },
      ],
      [
        makeStream("s1", "10", "lowviewer", "LowViewer", 100),
        makeStream("s2", "20", "highviewer", "HighViewer", 5000),
        makeStream("s3", "30", "midviewer", "MidViewer", 1000),
      ],
    )

    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    const { data } = (await res.json()) as {
      data: Array<{ broadcaster_user_id: string; viewer_count: number }>
    }

    expect(data.map((c) => c.broadcaster_user_id)).toEqual(["20", "30", "10"])
    expect(data[0].viewer_count).toBe(5000)
  })

  it("falls back to display name ascending for offline channels", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await syncChannels(cookie, [
      {
        broadcaster_id: "10",
        broadcaster_login: "zebra",
        broadcaster_name: "Zebra",
      },
      {
        broadcaster_id: "20",
        broadcaster_login: "apple",
        broadcaster_name: "Apple",
      },
      {
        broadcaster_id: "30",
        broadcaster_login: "mango",
        broadcaster_name: "Mango",
      },
    ])

    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    const { data } = (await res.json()) as {
      data: Array<{ broadcaster_display_name: string }>
    }

    expect(data.map((c) => c.broadcaster_display_name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ])
  })

  it("includes full stream metadata for live channels", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await syncChannels(
      cookie,
      [
        {
          broadcaster_id: "10",
          broadcaster_login: "streamer",
          broadcaster_name: "Streamer",
        },
      ],
      [
        {
          id: "stream_abc",
          user_id: "10",
          user_login: "streamer",
          user_name: "Streamer",
          game_id: "game_123",
          game_name: "Minecraft",
          viewer_count: 777,
          started_at: "2024-06-01T10:00:00Z",
          title: "Building stuff",
        },
      ],
    )

    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    const { data } = (await res.json()) as { data: unknown[] }

    expect(data[0]).toMatchObject({
      is_live: true,
      stream_id: "stream_abc",
      category_id: "game_123",
      category_name: "Minecraft",
      title: "Building stuff",
      viewer_count: 777,
      started_at: "2024-06-01T10:00:00Z",
    })
  })

  it("returns all channels when follow list exceeds D1 per-query variable limit", async () => {
    const COUNT = 101
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await syncChannels(
      cookie,
      Array.from({ length: COUNT }, (_, i) => ({
        broadcaster_id: String(i + 1),
        broadcaster_login: `channel${i + 1}`,
        broadcaster_name: `Channel${i + 1}`,
      })),
    )

    const res = await fetch(`${orchestrator.baseUrl}/api/channels/followed`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: unknown[] }
    expect(data).toHaveLength(COUNT)
  })
})
