import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

async function postSync(cookie: string) {
  return fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
    method: "POST",
    headers: { Cookie: cookie },
  })
}

async function reconnectRequired(cookie: string) {
  const me = await fetch(`${orchestrator.baseUrl}/api/me`, {
    headers: { Cookie: cookie },
  })
  const body = (await me.json()) as {
    data: { twitch_reconnect_required: boolean }
  }
  return body.data.twitch_reconnect_required
}

// Followed channels and streams are fetched concurrently, so both are queued
// with the same failure to keep the outcome independent of which settles first.
async function failHelixSync(status: number, headers?: Record<string, string>) {
  await orchestrator.mockTwitch.queue(
    "/helix/channels/followed",
    { message: "boom" },
    status,
    headers,
  )
  await orchestrator.mockTwitch.queue(
    "/helix/streams/followed",
    { message: "boom" },
    status,
    headers,
  )
}

describe("Twitch failure classification (issue #102)", () => {
  it("should return 503 twitch_unavailable and forward Retry-After on a Helix 429", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await failHelixSync(429, { "Retry-After": "30" })

    const res = await postSync(cookie)

    expect(res.status).toBe(503)
    expect(res.headers.get("retry-after")).toBe("30")
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "twitch_unavailable" },
    })
  })

  it("should return 502 twitch_unavailable on a Helix 5xx", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await failHelixSync(503)

    const res = await postSync(cookie)

    expect(res.status).toBe(502)
    expect(res.headers.get("retry-after")).toBeNull()
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "twitch_unavailable" },
    })
  })

  it("should return 502 twitch_unavailable on a Helix 5xx in category search", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.mockTwitch.queue(
      "/helix/search/categories",
      { message: "boom" },
      500,
    )

    const res = await fetch(
      `${orchestrator.baseUrl}/api/categories/search?q=mine`,
      { headers: { Cookie: cookie } },
    )

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "twitch_unavailable" },
    })
  })

  it("should return 502 twitch_unavailable, not reconnect_required, when the token refresh hits a 5xx", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange({ message: "oops" }, 503)

    const res = await postSync(cookie)

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "twitch_unavailable" },
    })
    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should return 503 twitch_unavailable when the token refresh is rate limited", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange({ message: "slow" }, 429)

    const res = await postSync(cookie)

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "twitch_unavailable" },
    })
    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should still return reconnect_required when the token refresh hits a 4xx", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange({ message: "bad" }, 400)

    const res = await postSync(cookie)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })
    expect(await reconnectRequired(cookie)).toBe(true)
  })
})
