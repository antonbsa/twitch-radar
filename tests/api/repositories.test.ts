import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Database } from "../../apps/api/src/db"
import { createMigratedD1, SqliteD1Database } from "./utils/sqlite-d1"

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
})
