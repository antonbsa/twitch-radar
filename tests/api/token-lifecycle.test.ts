import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

const NEW_TOKENS = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_in: 14400,
  scope: ["user:read:follows"],
  token_type: "bearer",
}

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

// Followed channels and streams are fetched concurrently, so a rejected sync
// attempt consumes one queued response on each endpoint.
async function queueSyncAttempt(status: number) {
  if (status === 200) {
    await orchestrator.mockTwitch.onFollowedChannels([])
    await orchestrator.mockTwitch.onFollowedStreams([])
    return
  }
  await orchestrator.mockTwitch.queue(
    "/helix/channels/followed",
    { message: "x" },
    status,
  )
  await orchestrator.mockTwitch.queue(
    "/helix/streams/followed",
    { message: "x" },
    status,
  )
}

async function tokenRequests() {
  const requests = await orchestrator.mockTwitch.requests()
  return requests.filter((url) => url.includes("/oauth2/token"))
}

describe("Upstream 401 on a request-time Helix call (issue #94)", () => {
  it("should refresh once and retry when Twitch rejects a token that looked valid", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await queueSyncAttempt(401)
    await orchestrator.mockTwitch.onTokenExchange(NEW_TOKENS)
    await queueSyncAttempt(200)

    const res = await postSync(cookie)

    expect(res.status).toBe(200)
    expect(await tokenRequests()).toHaveLength(1)
    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should return reconnect_required and flag the row when the retry is also a 401", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await queueSyncAttempt(401)
    await orchestrator.mockTwitch.onTokenExchange(NEW_TOKENS)
    await queueSyncAttempt(401)

    const res = await postSync(cookie)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })
    expect(await reconnectRequired(cookie)).toBe(true)
  })

  it("should return reconnect_required when the refresh after the 401 is rejected", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await queueSyncAttempt(401)
    await orchestrator.mockTwitch.onTokenExchange({ message: "revoked" }, 400)

    const res = await postSync(cookie)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })
    expect(await reconnectRequired(cookie)).toBe(true)
  })
})

describe("Concurrent token refresh (issue #94)", () => {
  it("should call Twitch's refresh endpoint once for simultaneous requests", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    // A second refresh would find no token exchange queued and fail the request.
    await orchestrator.mockTwitch.onTokenExchange(NEW_TOKENS)
    await queueSyncAttempt(200)
    await queueSyncAttempt(200)

    const [a, b] = await Promise.all([postSync(cookie), postSync(cookie)])

    expect([a.status, b.status]).toEqual([200, 200])
    expect(await tokenRequests()).toHaveLength(1)
  })
})

describe("Token validation sweep (issue #94)", () => {
  const STALE = "2020-01-01T00:00:00.000Z"

  async function validateRequests() {
    const requests = await orchestrator.mockTwitch.requests()
    return requests.filter((url) => url.includes("/oauth2/validate"))
  }

  it("should skip tokens validated recently", async () => {
    await orchestrator.createAuthenticatedSession()

    await orchestrator.runScheduled()

    expect(await validateRequests()).toHaveLength(0)
  })

  it("should leave a valid token alone and stamp it validated", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      tokenValidatedAt: STALE,
    })
    await orchestrator.mockTwitch.onTokenValidate(200)

    await orchestrator.runScheduled()
    // Validated now, so a second run doesn't call validate again.
    await orchestrator.runScheduled()

    expect(await validateRequests()).toHaveLength(1)
    expect(await tokenRequests()).toHaveLength(0)
    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should flag a revoked grant: validate says invalid and the refresh is rejected", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      tokenValidatedAt: STALE,
    })
    await orchestrator.mockTwitch.onTokenValidate(401)
    await orchestrator.mockTwitch.onTokenExchange({ message: "revoked" }, 400)

    await orchestrator.runScheduled()

    expect(await reconnectRequired(cookie)).toBe(true)
  })

  it("should refresh instead of flagging when only the access token is invalid", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      tokenValidatedAt: STALE,
    })
    await orchestrator.mockTwitch.onTokenValidate(401)
    await orchestrator.mockTwitch.onTokenExchange(NEW_TOKENS)

    await orchestrator.runScheduled()

    expect(await tokenRequests()).toHaveLength(1)
    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should not flag anything when Twitch fails to answer validate", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      tokenValidatedAt: STALE,
    })
    await orchestrator.mockTwitch.onTokenValidate(503)

    await orchestrator.runScheduled()

    expect(await reconnectRequired(cookie)).toBe(false)
  })

  it("should flag a token that can't be decrypted so it stops heading the sweep queue", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      tokenValidatedAt: STALE,
      undecryptableToken: true,
    })

    await orchestrator.runScheduled()

    expect(await validateRequests()).toHaveLength(0)
    expect(await reconnectRequired(cookie)).toBe(true)
  })
})
