import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Database } from "../../apps/api/src/db"
import { encryptToken, decryptToken } from "../../apps/api/src/services/crypto"
import { createMigratedD1, SqliteD1Database } from "./utils/sqlite-d1"

const ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ?? "dev-encryption-placeholder"

describe("Database repositories", () => {
  let rawDb: SqliteD1Database
  let db: Database

  beforeEach(async () => {
    rawDb = (await createMigratedD1()) as unknown as SqliteD1Database
    db = new Database(rawDb as unknown as D1Database)
  })

  afterEach(() => {
    rawDb.close()
  })

  it("inserts, reads, and updates users", async () => {
    await db.users.upsert({
      id: "user_1",
      twitchUserId: "123",
      twitchLogin: "radar_user",
      twitchDisplayName: "Radar User",
      now: "2026-06-22T12:00:00.000Z",
    })

    const created = await db.users.findByTwitchUserId("123")
    expect(created).toMatchObject({
      id: "user_1",
      twitch_login: "radar_user",
      last_follow_sync_at: null,
    })

    await db.users.updateLastFollowSyncAt(
      "user_1",
      "2026-06-22T12:10:00.000Z",
      "2026-06-22T12:11:00.000Z",
    )

    const updated = await db.users.findById("user_1")
    expect(updated).toMatchObject({
      last_follow_sync_at: "2026-06-22T12:10:00.000Z",
      updated_at: "2026-06-22T12:11:00.000Z",
    })
  })

  it("inserts, reads, and revokes push subscriptions", async () => {
    await db.users.upsert({
      id: "user_1",
      twitchUserId: "123",
      twitchLogin: "radar_user",
      twitchDisplayName: "Radar User",
      now: "2026-06-22T12:00:00.000Z",
    })

    await db.pushSubscriptions.create({
      id: "push_1",
      userId: "user_1",
      endpoint: "https://push.example/subscription",
      p256dh: "p256dh",
      auth: "auth",
      userAgent: "vitest",
      now: "2026-06-22T12:01:00.000Z",
    })

    const created = await db.pushSubscriptions.findByEndpoint(
      "https://push.example/subscription",
    )
    expect(created).toMatchObject({
      id: "push_1",
      revoked_at: null,
    })

    await db.pushSubscriptions.revoke("push_1", "2026-06-22T12:02:00.000Z")

    const revoked = await db.pushSubscriptions.findByEndpoint(
      "https://push.example/subscription",
    )
    expect(revoked).toMatchObject({
      revoked_at: "2026-06-22T12:02:00.000Z",
      updated_at: "2026-06-22T12:02:00.000Z",
    })
  })

  it("upserts and reads Twitch tokens with encryption round-trip", async () => {
    await db.users.upsert({
      id: "user_1",
      twitchUserId: "123",
      twitchLogin: "radar_user",
      twitchDisplayName: "Radar User",
      now: "2026-06-22T12:00:00.000Z",
    })

    const encryptedAccess = await encryptToken("access-abc", ENCRYPTION_KEY)
    const encryptedRefresh = await encryptToken("refresh-xyz", ENCRYPTION_KEY)

    await db.twitchTokens.upsert({
      userId: "user_1",
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: "2026-06-22T16:00:00.000Z",
      scopes: "user:read:follows",
      now: "2026-06-22T12:00:00.000Z",
    })

    const record = await db.twitchTokens.findByUserId("user_1")
    expect(record).not.toBeNull()
    expect(await decryptToken(record!.access_token, ENCRYPTION_KEY)).toBe(
      "access-abc",
    )
    expect(await decryptToken(record!.refresh_token, ENCRYPTION_KEY)).toBe(
      "refresh-xyz",
    )
    expect(record!.expires_at).toBe("2026-06-22T16:00:00.000Z")

    // upsert replaces on conflict
    await db.twitchTokens.upsert({
      userId: "user_1",
      accessToken: await encryptToken("access-new", ENCRYPTION_KEY),
      refreshToken: await encryptToken("refresh-new", ENCRYPTION_KEY),
      expiresAt: "2026-06-23T16:00:00.000Z",
      scopes: "user:read:follows",
      now: "2026-06-22T13:00:00.000Z",
    })

    const updated = await db.twitchTokens.findByUserId("user_1")
    expect(await decryptToken(updated!.access_token, ENCRYPTION_KEY)).toBe(
      "access-new",
    )
  })

  it("upserts and reads followed channels", async () => {
    await db.users.upsert({
      id: "user_1",
      twitchUserId: "123",
      twitchLogin: "radar_user",
      twitchDisplayName: "Radar User",
      now: "2026-06-22T12:00:00.000Z",
    })

    await db.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "b1",
        broadcasterLogin: "streamer_one",
        broadcasterDisplayName: "Streamer One",
        followedAt: "2024-01-15T00:00:00Z",
        now: "2026-06-22T12:00:00.000Z",
      },
      {
        userId: "user_1",
        broadcasterUserId: "b2",
        broadcasterLogin: "streamer_two",
        broadcasterDisplayName: "Streamer Two",
        followedAt: null,
        now: "2026-06-22T12:00:00.000Z",
      },
    ])

    const channels = await db.followedChannels.findByUserId("user_1")
    expect(channels).toHaveLength(2)
    expect(channels.find((c) => c.broadcaster_user_id === "b1")).toMatchObject({
      broadcaster_login: "streamer_one",
      followed_at: "2024-01-15T00:00:00Z",
    })
    expect(
      channels.find((c) => c.broadcaster_user_id === "b2")?.followed_at,
    ).toBeNull()

    // upsert updates existing row
    await db.followedChannels.upsertAll([
      {
        userId: "user_1",
        broadcasterUserId: "b1",
        broadcasterLogin: "streamer_one_renamed",
        broadcasterDisplayName: "Streamer One Renamed",
        now: "2026-06-22T13:00:00.000Z",
      },
    ])

    const after = await db.followedChannels.findByUserId("user_1")
    const b1 = after.find((c) => c.broadcaster_user_id === "b1")!
    expect(b1.broadcaster_login).toBe("streamer_one_renamed")
  })

  it("upserts and reads channel state", async () => {
    const now = "2026-06-22T12:00:00.000Z"

    await db.channelState.upsertAll([
      {
        broadcasterUserId: "b1",
        isLive: true,
        streamId: "stream_1",
        categoryId: "game_1",
        categoryName: "Minecraft",
        title: "Building a house",
        viewerCount: 1234,
        startedAt: "2026-06-22T10:00:00Z",
        now,
      },
      { broadcasterUserId: "b2", isLive: false, now },
    ])

    const states = await db.channelState.findByBroadcasterUserIds(["b1", "b2"])
    const s1 = states.find((s) => s.broadcaster_user_id === "b1")!
    const s2 = states.find((s) => s.broadcaster_user_id === "b2")!

    expect(s1.is_live).toBe(true)
    expect(s1.viewer_count).toBe(1234)
    expect(s1.category_name).toBe("Minecraft")
    expect(s2.is_live).toBe(false)
    expect(s2.viewer_count).toBeNull()

    // upsert flips live→offline
    await db.channelState.upsertAll([
      {
        broadcasterUserId: "b1",
        isLive: false,
        now: "2026-06-22T13:00:00.000Z",
      },
    ])

    const [updated] = await db.channelState.findByBroadcasterUserIds(["b1"])
    expect(updated.is_live).toBe(false)
    expect(updated.viewer_count).toBeNull()

    // empty ids returns empty array
    const empty = await db.channelState.findByBroadcasterUserIds([])
    expect(empty).toHaveLength(0)
  })
})
