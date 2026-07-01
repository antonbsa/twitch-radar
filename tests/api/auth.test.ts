import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import worker from "../../apps/api/src"
import type { Env } from "../../apps/api/src/env"
import {
  createSession,
  createOAuthState,
} from "../../apps/api/src/services/session"
import { createMigratedD1, SqliteD1Database } from "./utils/sqlite-d1"
import { MockKVNamespace } from "./utils/mock-kv"

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

describe("Auth routes", () => {
  let rawDb: SqliteD1Database
  let db: D1Database
  let kv: MockKVNamespace

  beforeEach(async () => {
    rawDb = (await createMigratedD1()) as unknown as SqliteD1Database
    db = rawDb as unknown as D1Database
    kv = new MockKVNamespace()
  })

  afterEach(() => {
    rawDb.close()
    vi.restoreAllMocks()
  })

  describe("GET /api/auth/twitch/start", () => {
    it("redirects to Twitch authorize with correct params and stores state in KV", async () => {
      const env = createEnv(db, kv)
      const res = await worker.fetch(
        new Request("http://localhost/api/auth/twitch/start"),
        env,
        ctx(),
      )

      expect(res.status).toBe(302)
      const location = new URL(res.headers.get("location")!)
      expect(location.hostname).toBe("id.twitch.tv")
      expect(location.pathname).toBe("/oauth2/authorize")
      expect(location.searchParams.get("response_type")).toBe("code")
      expect(location.searchParams.get("scope")).toBe("user:read:follows")

      const state = location.searchParams.get("state")!
      expect(state).toBeTruthy()
      // state must be stored in KV
      expect(await kv.get(`oauth_state:${state}`)).toBe("1")
    })
  })

  describe("GET /api/auth/twitch/callback", () => {
    it("exchanges code, creates user, stores tokens, returns session cookie", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_TOKEN_RESPONSE), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_USER_RESPONSE), { status: 200 }),
        )

      const env = createEnv(db, kv)
      const state = await createOAuthState(kv as unknown as KVNamespace)

      const res = await worker.fetch(
        new Request(
          `http://localhost/api/auth/twitch/callback?code=auth-code&state=${state}`,
        ),
        env,
        ctx(),
      )

      expect(res.status).toBe(302)

      const cookie = res.headers.get("set-cookie")!
      expect(cookie).toMatch(/^session=/)
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("SameSite=Lax")

      // state must be consumed
      expect(await kv.get(`oauth_state:${state}`)).toBeNull()

      // session must be in KV
      const sessionId = cookie.split(";")[0].split("=")[1]
      const sessionRaw = await kv.get(`session:${sessionId}`)
      expect(sessionRaw).not.toBeNull()
      const session = JSON.parse(sessionRaw!)
      expect(session.userId).toBeTruthy()
    })

    it("reconnects an existing user without creating a duplicate", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify(TWITCH_TOKEN_RESPONSE), { status: 200 }),
        )
        .mockResolvedValue(
          new Response(JSON.stringify(TWITCH_USER_RESPONSE), { status: 200 }),
        )

      const env = createEnv(db, kv)

      // First login
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_TOKEN_RESPONSE)),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_USER_RESPONSE)),
        )
      const state1 = await createOAuthState(kv as unknown as KVNamespace)
      const res1 = await worker.fetch(
        new Request(
          `http://localhost/api/auth/twitch/callback?code=code1&state=${state1}`,
        ),
        env,
        ctx(),
      )
      const userId1 = JSON.parse(
        (await kv.get(
          `session:${res1.headers.get("set-cookie")!.split(";")[0].split("=")[1]}`,
        ))!,
      ).userId

      // Second login with same Twitch account
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_TOKEN_RESPONSE)),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_USER_RESPONSE)),
        )
      const state2 = await createOAuthState(kv as unknown as KVNamespace)
      const res2 = await worker.fetch(
        new Request(
          `http://localhost/api/auth/twitch/callback?code=code2&state=${state2}`,
        ),
        env,
        ctx(),
      )
      const userId2 = JSON.parse(
        (await kv.get(
          `session:${res2.headers.get("set-cookie")!.split(";")[0].split("=")[1]}`,
        ))!,
      ).userId

      expect(userId1).toBe(userId2)
    })

    it("returns 400 for missing code or state", async () => {
      const env = createEnv(db, kv)
      const res = await worker.fetch(
        new Request("http://localhost/api/auth/twitch/callback"),
        env,
        ctx(),
      )
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      })
    })

    it("returns 400 for invalid state", async () => {
      const env = createEnv(db, kv)
      const res = await worker.fetch(
        new Request(
          "http://localhost/api/auth/twitch/callback?code=abc&state=not-a-real-state",
        ),
        env,
        ctx(),
      )
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        error: { code: "invalid_state" },
      })
    })
  })

  describe("POST /api/auth/logout", () => {
    it("deletes session and clears cookie", async () => {
      const env = createEnv(db, kv)
      const sessionId = await createSession(
        kv as unknown as KVNamespace,
        "user_1",
      )

      const res = await worker.fetch(
        new Request("http://localhost/api/auth/logout", {
          method: "POST",
          headers: { Cookie: `session=${sessionId}` },
        }),
        env,
        ctx(),
      )

      expect(res.status).toBe(204)
      expect(res.headers.get("set-cookie")).toContain("Max-Age=0")
      expect(await kv.get(`session:${sessionId}`)).toBeNull()
    })

    it("returns 401 without a session cookie", async () => {
      const env = createEnv(db, kv)
      const res = await worker.fetch(
        new Request("http://localhost/api/auth/logout", { method: "POST" }),
        env,
        ctx(),
      )
      expect(res.status).toBe(401)
    })
  })

  describe("GET /api/me", () => {
    it("returns the authenticated user", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_TOKEN_RESPONSE)),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(TWITCH_USER_RESPONSE)),
        )

      const env = createEnv(db, kv)
      const state = await createOAuthState(kv as unknown as KVNamespace)
      const callbackRes = await worker.fetch(
        new Request(
          `http://localhost/api/auth/twitch/callback?code=code&state=${state}`,
        ),
        env,
        ctx(),
      )
      const cookie = callbackRes.headers.get("set-cookie")!

      const meRes = await worker.fetch(
        new Request("http://localhost/api/me", {
          headers: { Cookie: cookie.split(";")[0] },
        }),
        env,
        ctx(),
      )

      expect(meRes.status).toBe(200)
      await expect(meRes.json()).resolves.toMatchObject({
        data: {
          twitch_login: "testuser",
          twitch_display_name: "TestUser",
        },
      })
    })

    it("returns 401 without a session", async () => {
      const env = createEnv(db, kv)
      const res = await worker.fetch(
        new Request("http://localhost/api/me"),
        env,
        ctx(),
      )
      expect(res.status).toBe(401)
    })
  })
})
