import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

const TWITCH_TOKEN_RESPONSE = {
  access_token: "twitch-access-token",
  refresh_token: "twitch-refresh-token",
  expires_in: 14400,
  scope: ["user:read:follows"],
  token_type: "bearer",
}

const TWITCH_USER_RESPONSE = {
  data: [
    {
      id: "twitch_user_123",
      login: "testuser",
      display_name: "TestUser",
      profile_image_url: "https://example.com/avatar.jpg",
    },
  ],
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("GET /api/auth/twitch/start", () => {
  it("should redirect to Twitch authorize with correct params and store state", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/auth/twitch/start`, {
      redirect: "manual",
    })

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/oauth2/authorize")
    expect(location.searchParams.get("response_type")).toBe("code")
    expect(location.searchParams.get("scope")).toBe("user:read:follows")
    expect(location.searchParams.get("state")).toBeTruthy()
  })
})

describe("GET /api/auth/twitch/callback", () => {
  async function getOAuthState(): Promise<string> {
    const res = await fetch(`${orchestrator.baseUrl}/api/auth/twitch/start`, {
      redirect: "manual",
    })
    const location = new URL(res.headers.get("location")!)
    return location.searchParams.get("state")!
  }

  it("should exchange code, create user, store tokens, and return session cookie", async () => {
    const state = await getOAuthState()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=auth-code&state=${state}`,
      { redirect: "manual" },
    )

    // Not a 302 redirect: Safari drops a Set-Cookie that arrives on the same
    // response as a Location header for a cross-site redirect chain, so the
    // callback lands on a real 200 page that redirects client-side instead.
    expect(res.status).toBe(200)

    const cookie = res.headers.get("set-cookie")!
    expect(cookie).toMatch(/^session=/)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
  })

  it("should reconnect an existing user without creating a duplicate", async () => {
    const state1 = await getOAuthState()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res1 = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=code1&state=${state1}`,
      { redirect: "manual" },
    )
    const cookie1 = res1.headers.get("set-cookie")!.split(";")[0]

    const state2 = await getOAuthState()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res2 = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=code2&state=${state2}`,
      { redirect: "manual" },
    )
    const cookie2 = res2.headers.get("set-cookie")!.split(";")[0]

    const me1 = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie1 },
    })
    const me2 = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie2 },
    })

    const body1 = (await me1.json()) as { data: { id: string } }
    const body2 = (await me2.json()) as { data: { id: string } }
    expect(body1.data.id).toBe(body2.data.id)
  })

  it("should return 400 for missing code or state", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/auth/twitch/callback`)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    })
  })

  it("should redirect to login with an error param when Twitch reports the user declined", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?error=access_denied&error_description=The+user+denied+you+access`,
      { redirect: "manual" },
    )

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/login")
    expect(location.searchParams.get("error")).toBe("twitch_declined")
  })

  it("should return 400 for invalid state", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=abc&state=not-a-real-state`,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_state" },
    })
  })
})

describe("POST /api/auth/logout", () => {
  it("should delete session and clear cookie", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const res = await fetch(`${orchestrator.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0")

    const meRes = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })
    expect(meRes.status).toBe(401)
  })

  it("should return 401 without a session cookie", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/auth/logout`, {
      method: "POST",
    })
    expect(res.status).toBe(401)
  })
})

describe("GET /api/me", () => {
  it("should return the authenticated user", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      twitchLogin: "testuser",
      twitchDisplayName: "TestUser",
    })

    const res = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: {
        twitch_login: "testuser",
        twitch_display_name: "TestUser",
      },
    })
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/me`)
    expect(res.status).toBe(401)
  })
})
