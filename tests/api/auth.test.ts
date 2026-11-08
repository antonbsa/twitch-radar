import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"
import { expectApiError, expectConforms } from "./setup/contract"
import { MeResponse } from "../../apps/api/src/contracts/me"

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

    const cookie = res.headers.get("set-cookie")!
    expect(cookie).toContain(
      `oauth_state=${location.searchParams.get("state")}`,
    )
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Path=/api/auth")
    expect(cookie).toContain("Max-Age=600")
  })
})

describe("GET /api/auth/twitch/callback", () => {
  async function startLogin(): Promise<{ state: string; stateCookie: string }> {
    const res = await fetch(`${orchestrator.baseUrl}/api/auth/twitch/start`, {
      redirect: "manual",
    })
    const location = new URL(res.headers.get("location")!)
    return {
      state: location.searchParams.get("state")!,
      stateCookie: res.headers.get("set-cookie")!.split(";")[0],
    }
  }

  it("should exchange code, create user, store tokens, and return session cookie", async () => {
    const { state, stateCookie } = await startLogin()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=auth-code&state=${state}`,
      { redirect: "manual", headers: { Cookie: stateCookie } },
    )

    // Not a 302 redirect: Safari drops a Set-Cookie that arrives on the same
    // response as a Location header for a cross-site redirect chain, so the
    // callback lands on a real 200 page that redirects client-side instead.
    expect(res.status).toBe(200)

    const cookies = res.headers.getSetCookie()
    const session = cookies.find((c) => c.startsWith("session="))!
    expect(session).toContain("HttpOnly")
    expect(session).toContain("SameSite=Lax")
    const cleared = cookies.find((c) => c.startsWith("oauth_state="))!
    expect(cleared).toContain("Max-Age=0")
    expect(cleared).toContain("Path=/api/auth")
  })

  it("should reconnect an existing user without creating a duplicate", async () => {
    const { state: state1, stateCookie: stateCookie1 } = await startLogin()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res1 = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=code1&state=${state1}`,
      { redirect: "manual", headers: { Cookie: stateCookie1 } },
    )
    const cookie1 = res1.headers
      .getSetCookie()
      .find((c) => c.startsWith("session="))!
      .split(";")[0]

    const { state: state2, stateCookie: stateCookie2 } = await startLogin()
    await orchestrator.mockTwitch.onTokenExchange(TWITCH_TOKEN_RESPONSE)
    await orchestrator.mockTwitch.onUserInfo(TWITCH_USER_RESPONSE)

    const res2 = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=code2&state=${state2}`,
      { redirect: "manual", headers: { Cookie: stateCookie2 } },
    )
    const cookie2 = res2.headers
      .getSetCookie()
      .find((c) => c.startsWith("session="))!
      .split(";")[0]

    const me1 = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie1 },
    })
    const me2 = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie2 },
    })

    const body1 = await expectConforms(me1, 200, MeResponse)
    const body2 = await expectConforms(me2, 200, MeResponse)
    expect(body1.data.id).toBe(body2.data.id)
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

  async function expectInvalidStateRedirect(res: Response) {
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/login")
    expect(location.searchParams.get("error")).toBe("invalid_state")
    expect(res.headers.get("set-cookie")).toMatch(/oauth_state=;.*Max-Age=0/)
  }

  it("should redirect to login for a valid state without the binding cookie", async () => {
    const { state } = await startLogin()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=abc&state=${state}`,
      { redirect: "manual" },
    )
    await expectInvalidStateRedirect(res)
  })

  it("should redirect to login when the binding cookie differs from the state", async () => {
    const { state } = await startLogin()
    const { stateCookie: otherCookie } = await startLogin()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=abc&state=${state}`,
      { headers: { Cookie: otherCookie }, redirect: "manual" },
    )
    await expectInvalidStateRedirect(res)
  })

  it("should redirect to login when the callback has no code or state", async () => {
    await expectInvalidStateRedirect(
      await fetch(`${orchestrator.baseUrl}/api/auth/twitch/callback`, {
        redirect: "manual",
      }),
    )
  })

  it("should redirect to login for a valid state and cookie but no code", async () => {
    const { state, stateCookie } = await startLogin()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?state=${state}`,
      { headers: { Cookie: stateCookie }, redirect: "manual" },
    )
    await expectInvalidStateRedirect(res)
  })

  it("should redirect to login for an unknown or expired state", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/auth/twitch/callback?code=abc&state=not-a-real-state`,
      {
        headers: { Cookie: "oauth_state=not-a-real-state" },
        redirect: "manual",
      },
    )
    await expectInvalidStateRedirect(res)
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
    await expectApiError(meRes, 401, "session_expired")
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

    const body = await expectConforms(res, 200, MeResponse)
    expect(body.data).toMatchObject({
      twitch_login: "testuser",
      twitch_display_name: "TestUser",
    })
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/me`)
    await expectApiError(res, 401, "auth_required")
  })
})

describe("Sliding sessions", () => {
  const DAY_S = 60 * 60 * 24

  it("should not touch the cookie while the session is far from expiring", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const res = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("should renew a session in its last week to the full 30 days and refresh the cookie", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      sessionTtlS: 3 * DAY_S,
    })

    const res = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toContain(`Max-Age=${30 * DAY_S}`)
  })

  it("should cap the renewal at the session's max lifetime", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      sessionTtlS: 3 * DAY_S,
      sessionMaxLifetimeS: 10 * DAY_S,
    })

    const res = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    const maxAge = Number(
      /Max-Age=(\d+)/.exec(res.headers.get("set-cookie")!)?.[1],
    )
    expect(maxAge).toBeGreaterThan(9 * DAY_S)
    expect(maxAge).toBeLessThanOrEqual(10 * DAY_S)
  })

  it("should not renew a session already at its max lifetime", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      sessionTtlS: 3 * DAY_S,
      sessionMaxLifetimeS: 3 * DAY_S,
    })

    const res = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("should keep the logout cookie clearing when the session was due for renewal", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      sessionTtlS: 3 * DAY_S,
    })

    const res = await fetch(`${orchestrator.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
