import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import worker from "../../apps/api/src"
import { Database } from "../../apps/api/src/db"
import type { Env } from "../../apps/api/src/env"
import { encryptToken } from "../../apps/api/src/services/crypto"
import { createSession } from "../../apps/api/src/services/session"
import { createMigratedD1, SqliteD1Database } from "./utils/sqlite-d1"
import { MockKVNamespace } from "./utils/mock-kv"

const ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? "dev-encryption-placeholder"

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

function makeFollowedChannelsResponse(
  channels: Array<{
    broadcaster_id: string
    broadcaster_login: string
    broadcaster_name: string
  }>,
  cursor?: string,
) {
  return new Response(
    JSON.stringify({
      data: channels.map((ch) => ({
        ...ch,
        followed_at: "2024-01-01T00:00:00Z",
      })),
      pagination: cursor ? { cursor } : {},
    }),
  )
}

function makeFollowedStreamsResponse(
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
  return new Response(
    JSON.stringify({
      data: streams.map((s) => ({ ...s, type: "live" })),
      pagination: {},
    }),
  )
}

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

describe("POST /api/sync/follows", () => {
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

    await dbClient.twitchTokens.upsert({
      userId: "user_1",
      accessToken: await encryptToken("valid-access-token", ENCRYPTION_KEY),
      refreshToken: await encryptToken("valid-refresh-token", ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: "user:read:follows",
      now: "2024-01-01T00:00:00Z",
    })

    sessionId = await createSession(kv as unknown as KVNamespace, "user_1")
  })

  afterEach(() => {
    rawDb.close()
    vi.restoreAllMocks()
  })

  it("syncs followed channels and live stream state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeFollowedChannelsResponse([CHANNEL_A, CHANNEL_B]),
      )
      .mockResolvedValueOnce(makeFollowedStreamsResponse([STREAM_A]))

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/sync/follows", {
        method: "POST",
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true })

    const channels = await dbClient.followedChannels.findByUserId("user_1")
    expect(channels).toHaveLength(2)
    expect(channels.map((c) => c.broadcaster_user_id).sort()).toEqual([
      "100",
      "200",
    ])

    const states = await dbClient.channelState.findByBroadcasterUserIds([
      "100",
      "200",
    ])
    const stateA = states.find((s) => s.broadcaster_user_id === "100")!
    const stateB = states.find((s) => s.broadcaster_user_id === "200")!

    expect(stateA.is_live).toBe(true)
    expect(stateA.viewer_count).toBe(1000)
    expect(stateA.category_name).toBe("Minecraft")
    expect(stateB.is_live).toBe(false)
    expect(stateB.viewer_count).toBeNull()

    const user = await dbClient.users.findById("user_1")
    expect(user!.last_follow_sync_at).not.toBeNull()
  })

  it("handles Twitch pagination across multiple pages", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes("/channels/followed")) {
        return url.includes("after=cursor-page-2")
          ? makeFollowedChannelsResponse([CHANNEL_B])
          : makeFollowedChannelsResponse([CHANNEL_A], "cursor-page-2")
      }
      if (url.includes("/streams/followed"))
        return makeFollowedStreamsResponse([])
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/sync/follows", {
        method: "POST",
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    expect(res.status).toBe(200)
    const channels = await dbClient.followedChannels.findByUserId("user_1")
    expect(channels).toHaveLength(2)
  })

  it("refreshes an expired token before syncing", async () => {
    await dbClient.twitchTokens.upsert({
      userId: "user_1",
      accessToken: await encryptToken("expired-token", ENCRYPTION_KEY),
      refreshToken: await encryptToken("valid-refresh-token", ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      scopes: "user:read:follows",
      now: new Date().toISOString(),
    })

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 14400,
            scope: ["user:read:follows"],
            token_type: "bearer",
          }),
        ),
      )
      .mockResolvedValueOnce(makeFollowedChannelsResponse([CHANNEL_A]))
      .mockResolvedValueOnce(makeFollowedStreamsResponse([]))

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/sync/follows", {
        method: "POST",
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    expect(res.status).toBe(200)

    // new access token must be persisted
    const tokenRecord = await dbClient.twitchTokens.findByUserId("user_1")
    const { decryptToken } = await import("../../apps/api/src/services/crypto")
    expect(await decryptToken(tokenRecord!.access_token, ENCRYPTION_KEY)).toBe(
      "new-access-token",
    )
  })

  it("returns 401 reconnect_required when token refresh fails", async () => {
    await dbClient.twitchTokens.upsert({
      userId: "user_1",
      accessToken: await encryptToken("expired-token", ENCRYPTION_KEY),
      refreshToken: await encryptToken("bad-refresh-token", ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      scopes: "user:read:follows",
      now: new Date().toISOString(),
    })

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    )

    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/sync/follows", {
        method: "POST",
        headers: { Cookie: `session=${sessionId}` },
      }),
      env,
      ctx(),
    )

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })
  })

  it("returns 401 without a session", async () => {
    const env = createEnv(db, kv)
    const res = await worker.fetch(
      new Request("http://localhost/api/sync/follows", { method: "POST" }),
      env,
      ctx(),
    )
    expect(res.status).toBe(401)
  })
})
