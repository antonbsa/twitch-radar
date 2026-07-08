import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("GET /api/categories/search", () => {
  it("should return matching categories from Twitch", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onCategorySearch([
      { id: "27471", name: "Minecraft", box_art_url: "https://img/mc.jpg" },
      { id: "509658", name: "Just Chatting" },
    ])

    const res = await fetch(
      `${orchestrator.baseUrl}/api/categories/search?q=mine`,
      { headers: { Cookie: cookie } },
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: "27471", name: "Minecraft", box_art_url: "https://img/mc.jpg" },
        { id: "509658", name: "Just Chatting", box_art_url: null },
      ],
    })
  })

  it("should return an empty list when Twitch finds no categories (404)", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.onCategorySearch([], 404)

    const res = await fetch(
      `${orchestrator.baseUrl}/api/categories/search?q=zzzznope`,
      { headers: { Cookie: cookie } },
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [] })
  })

  it("should return 400 when the query is missing or blank", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    for (const suffix of ["", "?q=", "?q=%20%20"]) {
      const res = await fetch(
        `${orchestrator.baseUrl}/api/categories/search${suffix}`,
        { headers: { Cookie: cookie } },
      )
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      })
    }
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/categories/search?q=mine`,
    )
    expect(res.status).toBe(401)
  })
})
