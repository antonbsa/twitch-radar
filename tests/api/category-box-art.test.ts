import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

const MINECRAFT_ART =
  "https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-{width}x{height}.jpg"
const MINECRAFT = { id: "27471", name: "Minecraft", box_art_url: MINECRAFT_ART }

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

async function postGlobalPref(cookie: string) {
  return fetch(`${orchestrator.baseUrl}/api/preferences/global`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      category_id: MINECRAFT.id,
      category_name: MINECRAFT.name,
    }),
  })
}

async function getPreferences(cookie: string) {
  const res = await fetch(`${orchestrator.baseUrl}/api/preferences`, {
    headers: { Cookie: cookie },
  })
  expect(res.status).toBe(200)
  const { data } = (await res.json()) as {
    data: {
      channel: Array<{ box_art_url: string | null }>
      global: Array<{ box_art_url: string | null }>
    }
  }
  return data
}

async function gamesRequests() {
  return (await orchestrator.mockTwitch.requests()).filter((path) =>
    path.includes("/helix/games"),
  )
}

describe("category box art (ADR 0058)", () => {
  it("should resolve a missing category through Get Games once and serve it from D1 afterwards", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      user: { id: userId, twitchUserId: `twitch_${userId}` },
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onGames([MINECRAFT])

    const first = await getPreferences(cookie)
    expect(first.global[0].box_art_url).toBe(MINECRAFT_ART)
    expect(await gamesRequests()).toHaveLength(1)

    const second = await getPreferences(cookie)
    expect(second.global[0].box_art_url).toBe(MINECRAFT_ART)
    expect(await gamesRequests()).toHaveLength(1)
  })

  it("should be seeded by category search so creating a preference needs no Get Games call", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onCategorySearch([MINECRAFT])
    await fetch(`${orchestrator.baseUrl}/api/categories/search?q=mine`, {
      headers: { Cookie: cookie },
    })

    const res = await postGlobalPref(cookie)

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      data: { category_id: MINECRAFT.id, box_art_url: MINECRAFT_ART },
    })
    expect(await gamesRequests()).toHaveLength(0)
  })

  it("should return a null URL, and retry next read, when Get Games fails", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      user: { id: userId, twitchUserId: `twitch_${userId}` },
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onGames([], 500)

    const failed = await getPreferences(cookie)
    expect(failed.global[0].box_art_url).toBeNull()

    await orchestrator.mockTwitch.onGames([MINECRAFT])
    const retried = await getPreferences(cookie)
    expect(retried.global[0].box_art_url).toBe(MINECRAFT_ART)
  })

  it("should cache a category Twitch does not return as null instead of asking again", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      user: { id: userId, twitchUserId: `twitch_${userId}` },
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onGames([])

    await getPreferences(cookie)
    const again = await getPreferences(cookie)

    expect(again.global[0].box_art_url).toBeNull()
    expect(await gamesRequests()).toHaveLength(1)
  })

  it("should not flag the user's session when Twitch rejects the lookup", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      user: { id: userId, twitchUserId: `twitch_${userId}` },
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onGames([], 401)

    await getPreferences(cookie)

    const me = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })
    await expect(me.json()).resolves.toMatchObject({
      data: { twitch_reconnect_required: false },
    })
  })
})
