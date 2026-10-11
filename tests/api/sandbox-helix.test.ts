import { describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"
import {
  accessTokenFor,
  getPersonaFixture,
  PERSONAS,
  refreshTokenFor,
} from "../../apps/api/src/features/sandbox/personas"
import {
  refreshAccessToken,
  validateAccessToken,
} from "../../apps/api/src/services/twitch/oauth"
import {
  searchCategories,
  getCategoriesByIds,
} from "../../apps/api/src/services/twitch/categories"
import { createEventsubSubscription } from "../../apps/api/src/services/twitch/eventsub"
import {
  getAllFollowedStreams,
  getStreamsByUserIds,
} from "../../apps/api/src/services/twitch/streams"
import {
  getAllFollowedChannels,
  getAuthenticatedUser,
  getUsersByIds,
} from "../../apps/api/src/services/twitch/users"

// These drive the app's real Twitch client functions against the fake, so a
// response shape the client can't parse fails here instead of mid-demo.
const API_BASE = `${orchestrator.baseUrl}/api/__sandbox__`
const AUTH_BASE = `${API_BASE}/auth`
const CLIENT_ID = "sandbox-client"
const FULL = getPersonaFixture("full")
const FULL_TOKEN = accessTokenFor("full")

describe("sandbox fake Helix", () => {
  it.each(PERSONAS)(
    "should expose a Twitch-side follow list that is a strict superset of what login seeds for %s",
    (persona) => {
      const { follows } = getPersonaFixture(persona)
      expect(follows.some((f) => f.seeded)).toBe(persona !== "empty")
      expect(follows.some((f) => !f.seeded)).toBe(true)
    },
  )

  it("should return the persona's full follow list", async () => {
    const channels = await getAllFollowedChannels(
      CLIENT_ID,
      FULL_TOKEN,
      FULL.user.twitchUserId,
      API_BASE,
    )
    expect(channels.map((c) => c.broadcaster_id).sort()).toEqual(
      FULL.follows.map((f) => f.broadcasterUserId).sort(),
    )
  })

  it("should return only live follows from streams/followed", async () => {
    const streams = await getAllFollowedStreams(
      CLIENT_ID,
      FULL_TOKEN,
      FULL.user.twitchUserId,
      API_BASE,
    )
    expect(streams.map((s) => s.user_id).sort()).toEqual([
      "sbx_bc_aurora",
      "sbx_bc_bytewolf",
      "sbx_bc_ember",
    ])
  })

  it("should look up streams by broadcaster id", async () => {
    const streams = await getStreamsByUserIds(
      CLIENT_ID,
      FULL_TOKEN,
      ["sbx_bc_ember", "sbx_bc_cinder"],
      API_BASE,
    )
    expect(streams).toHaveLength(1)
    expect(streams[0]).toMatchObject({
      user_id: "sbx_bc_ember",
      game_name: "VALORANT",
      type: "live",
    })
  })

  it("should resolve users by id and the authenticated user from the token", async () => {
    const users = await getUsersByIds(
      CLIENT_ID,
      FULL_TOKEN,
      ["sbx_bc_aurora", "unknown"],
      API_BASE,
    )
    expect(users.map((u) => u.login)).toEqual(["aurora_plays"])

    const self = await getAuthenticatedUser(CLIENT_ID, FULL_TOKEN, API_BASE)
    expect(self.id).toBe(FULL.user.twitchUserId)
  })

  it("should search and look up fixture categories", async () => {
    const results = await searchCategories(
      CLIENT_ID,
      FULL_TOKEN,
      "mine",
      API_BASE,
    )
    expect(results.map((c) => c.name)).toEqual(["Minecraft"])
    expect(results[0].box_art_url).toContain("27471")

    expect(
      await searchCategories(CLIENT_ID, FULL_TOKEN, "zzz", API_BASE),
    ).toEqual([])
    const byId = await getCategoriesByIds(
      CLIENT_ID,
      FULL_TOKEN,
      ["512953"],
      API_BASE,
    )
    expect(byId.map((c) => c.name)).toEqual(["Elden Ring"])
  })

  it("should accept EventSub subscriptions", async () => {
    const subscription = await createEventsubSubscription(
      CLIENT_ID,
      "sandbox-app-token",
      {
        type: "stream.online",
        version: "1",
        broadcasterUserId: "sbx_bc_aurora",
        callbackUrl: "https://example.test/hook",
        secret: "s",
      },
      API_BASE,
    )
    expect(subscription.type).toBe("stream.online")
  })
})

describe("sandbox fake id.twitch.tv", () => {
  it("should refresh a persona's tokens and reject an unknown refresh token", async () => {
    const refreshed = await refreshAccessToken(
      CLIENT_ID,
      "secret",
      refreshTokenFor("full"),
      AUTH_BASE,
    )
    expect(refreshed.access_token).toBe(FULL_TOKEN)

    await expect(
      refreshAccessToken(CLIENT_ID, "secret", "bogus", AUTH_BASE),
    ).rejects.toThrow()
  })

  it("should validate persona access tokens only", async () => {
    expect(await validateAccessToken(FULL_TOKEN, AUTH_BASE)).toBe(true)
    expect(await validateAccessToken("bogus", AUTH_BASE)).toBe(false)
  })
})
