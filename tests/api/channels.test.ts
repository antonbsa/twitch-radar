import { afterEach, beforeEach, describe, expect, it } from "vitest"
import worker from "../../apps/api/src"
import { Database } from "../../apps/api/src/db"
import type { Env } from "../../apps/api/src/env"
import { createSession } from "../../apps/api/src/services/session"
import { createMigratedD1, SqliteD1Database } from "./utils/sqlite-d1"
import { MockKVNamespace } from "./utils/mock-kv"

function createEnv(db: D1Database, kv: MockKVNamespace): Env {
  return {
    ...(process.env as unknown as Env),
    DB: db,
    APP_CACHE: kv as unknown as KVNamespace,
    TWITCH_EVENTS_QUEUE: {} as Queue,
    NOTIFICATION_JOBS_QUEUE: {} as Queue,
  }
}

function ctx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext
}

describe("GET /api/channels/followed", () => {
  let rawDb: SqliteD1Database
  let db: D1Database
  let dbClient: Database
  let kv: MockKVNamespace
  let sessionId: string

  beforeEach(async () => {
    rawDb = (await createMigratedD1()) as unknown as SqliteD1Database
    db = rawDb as unknown as D1Database
    dbClient = new Database(db)
    kv = new MockKVNamespace()

    await dbClient.users.upsert({
      id: "user_1",
      twitchUserId: "twitch_123",
      twitchLogin: "testuser",
      twitchDisplayName: "TestUser",
      now: "2024-01-01T00:00:00Z",
    })

    sessionId = await createSession(kv as unknown as KVNamespace, "user_1")
  })

  afterEach(() => {
    rawDb.close()
  })

  it("returns 401 without a session", async () => {
    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed"),
      env,
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("returns empty array when no channels are synced", async () => {
    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed", {
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: [] })
  })

  it("returns live channels before offline channels", async () => {
    const now = "2024-06-01T00:00:00Z"
    await dbClient.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "10",
        broadcasterLogin: "offline1",
        broadcasterDisplayName: "Offline1",
        now,
      },
      {
        userId: "user_1",
        broadcasterUserId: "20",
        broadcasterLogin: "live1",
        broadcasterDisplayName: "Live1",
        now,
      },
    ])
    await dbClient.channelState.upsertAll([
      { broadcasterUserId: "10", isLive: false, now },
      {
        broadcasterUserId: "20",
        isLive: true,
        viewerCount: 500,
        streamId: "s1",
        startedAt: "2024-06-01T10:00:00Z",
        now,
      },
    ])

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed", {
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    const body = (await res.json()) as {
      data: { broadcaster_user_id: string; is_live: boolean }[]
    }
    expect(body.data[0].broadcaster_user_id).toBe("20")
    expect(body.data[0].is_live).toBe(true)
    expect(body.data[1].broadcaster_user_id).toBe("10")
    expect(body.data[1].is_live).toBe(false)
  })

  it("sorts live channels by viewer count descending", async () => {
    const now = "2024-06-01T00:00:00Z"
    await dbClient.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "10",
        broadcasterLogin: "lowviewer",
        broadcasterDisplayName: "LowViewer",
        now,
      },
      {
        userId: "user_1",
        broadcasterUserId: "20",
        broadcasterLogin: "highviewer",
        broadcasterDisplayName: "HighViewer",
        now,
      },
      {
        userId: "user_1",
        broadcasterUserId: "30",
        broadcasterLogin: "midviewer",
        broadcasterDisplayName: "MidViewer",
        now,
      },
    ])
    await dbClient.channelState.upsertAll([
      { broadcasterUserId: "10", isLive: true, viewerCount: 100, now },
      { broadcasterUserId: "20", isLive: true, viewerCount: 5000, now },
      { broadcasterUserId: "30", isLive: true, viewerCount: 1000, now },
    ])

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed", {
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    const body = (await res.json()) as {
      data: { broadcaster_user_id: string; viewer_count: number }[]
    }
    expect(body.data.map((c) => c.broadcaster_user_id)).toEqual([
      "20",
      "30",
      "10",
    ])
    expect(body.data[0].viewer_count).toBe(5000)
  })

  it("falls back to display name ascending for ties and offline channels", async () => {
    const now = "2024-06-01T00:00:00Z"
    await dbClient.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "10",
        broadcasterLogin: "zebra",
        broadcasterDisplayName: "Zebra",
        now,
      },
      {
        userId: "user_1",
        broadcasterUserId: "20",
        broadcasterLogin: "apple",
        broadcasterDisplayName: "Apple",
        now,
      },
      {
        userId: "user_1",
        broadcasterUserId: "30",
        broadcasterLogin: "mango",
        broadcasterDisplayName: "Mango",
        now,
      },
    ])
    await dbClient.channelState.upsertAll([
      { broadcasterUserId: "10", isLive: false, now },
      { broadcasterUserId: "20", isLive: false, now },
      { broadcasterUserId: "30", isLive: false, now },
    ])

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed", {
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    const body = (await res.json()) as {
      data: { broadcaster_display_name: string }[]
    }
    expect(body.data.map((c) => c.broadcaster_display_name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ])
  })

  it("includes full stream metadata for live channels", async () => {
    const now = "2024-06-01T00:00:00Z"
    await dbClient.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "10",
        broadcasterLogin: "streamer",
        broadcasterDisplayName: "Streamer",
        now,
      },
    ])
    await dbClient.channelState.upsertAll([
      {
        broadcasterUserId: "10",
        isLive: true,
        streamId: "stream_abc",
        categoryId: "game_123",
        categoryName: "Minecraft",
        title: "Building stuff",
        viewerCount: 777,
        startedAt: "2024-06-01T10:00:00Z",
        now,
      },
    ])

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/channels/followed", {
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    const body = (await res.json()) as { data: unknown[] }
    expect(body.data[0]).toMatchObject({
      is_live: true,
      stream_id: "stream_abc",
      category_id: "game_123",
      category_name: "Minecraft",
      title: "Building stuff",
      viewer_count: 777,
      started_at: "2024-06-01T10:00:00Z",
    })
  })
})
