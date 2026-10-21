import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"
import {
  getPersonaFixture,
  PERSONAS,
} from "../../apps/api/src/features/sandbox/personas"

const SEEDED_FULL = getPersonaFixture("full").follows.filter((f) => f.seeded)

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

async function loginAs(persona: unknown, overrides?: unknown) {
  return fetch(`${orchestrator.baseUrl}/api/__sandbox__/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona, overrides }),
  })
}

interface Me {
  data: {
    language: string
    notifications_paused_at: string | null
    twitch_reconnect_required: boolean
  }
}

async function getJson<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${orchestrator.baseUrl}${path}`, {
    headers: { Cookie: cookie },
  })
  expect(res.status).toBe(200)
  return (await res.json()) as T
}

/** The `name=value` pair of the session Set-Cookie, ready for a Cookie header. */
function sessionCookie(res: Response): string {
  const header = res.headers.get("set-cookie")
  expect(header).toMatch(/^session=/)
  return header!.split(";")[0]
}

describe("POST /api/__sandbox__/login", () => {
  it.each(["nobody", "", null, 42, undefined])(
    "should reject the non-persona value %j with 400",
    async (persona) => {
      const res = await loginAs(persona)
      expect(res.status).toBe(400)
    },
  )

  it.each(PERSONAS)(
    "should return a session cookie that authenticates /me as the %s persona",
    async (persona) => {
      const res = await loginAs(persona)
      expect(res.status).toBe(200)

      const me = await getJson<{
        data: { id: string; twitch_reconnect_required: boolean }
      }>("/api/me", sessionCookie(res))
      expect(me.data.id).toBe(`usr_sandbox_${persona}`)
      expect(me.data.twitch_reconnect_required).toBe(persona === "reconnect")
    },
  )

  it("should seed only the fixture's pre-synced follows for the full persona", async () => {
    const cookie = sessionCookie(await loginAs("full"))

    const followed = await getJson<{
      data: {
        broadcaster_user_id: string
        is_live: boolean
        started_at: string | null
        category_started_at: string | null
      }[]
    }>("/api/channels/followed", cookie)
    const ids = followed.data.map((c) => c.broadcaster_user_id).sort()
    expect(ids).toEqual(SEEDED_FULL.map((f) => f.broadcasterUserId).sort())
    expect(followed.data.filter((c) => c.is_live)).toHaveLength(
      SEEDED_FULL.filter((f) => f.stream).length,
    )
    // The time in category starts at the stream start, as for a stream that
    // went live in its first category.
    for (const channel of followed.data.filter((c) => c.is_live)) {
      expect(channel.category_started_at).toBe(channel.started_at)
    }

    const prefs = await getJson<{
      data: { channel: unknown[]; global: unknown[] }
    }>("/api/preferences", cookie)
    expect(prefs.data.channel).toHaveLength(1)
    expect(prefs.data.global).toHaveLength(1)
  })

  it("should start the empty persona with no follows", async () => {
    const cookie = sessionCookie(await loginAs("empty"))
    const followed = await getJson<{ data: unknown[] }>(
      "/api/channels/followed",
      cookie,
    )
    expect(followed.data).toEqual([])
  })

  it("should restore the fixture baseline on a repeat login", async () => {
    const cookie = sessionCookie(await loginAs("full"))
    const prefs = await getJson<{ data: { channel: { id: string }[] } }>(
      "/api/preferences",
      cookie,
    )
    await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/${prefs.data.channel[0].id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )

    const again = sessionCookie(await loginAs("full"))
    const restored = await getJson<{
      data: { channel: unknown[]; global: unknown[] }
    }>("/api/preferences", again)
    expect(restored.data.channel).toHaveLength(1)
    expect(restored.data.global).toHaveLength(1)
  })

  it("should survive the default-scope test-seam reset used by the E2E tier", async () => {
    const cookie = sessionCookie(await loginAs("full"))

    const reset = await fetch(`${orchestrator.baseUrl}/api/__test__/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(reset.status).toBe(204)

    const followed = await getJson<{ data: unknown[] }>(
      "/api/channels/followed",
      cookie,
    )
    expect(followed.data).toHaveLength(SEEDED_FULL.length)
  })

  it("should seed the muted_paused persona's pause, mute and exclusion", async () => {
    const cookie = sessionCookie(await loginAs("muted_paused"))

    const me = await getJson<Me>("/api/me", cookie)
    expect(me.data.notifications_paused_at).not.toBeNull()
    const mutes = await getJson<{ data: { broadcaster_user_id: string }[] }>(
      "/api/notifications/mutes",
      cookie,
    )
    expect(mutes.data.map((m) => m.broadcaster_user_id)).toEqual([
      "sbx_bc_aurora",
    ])
    const prefs = await getJson<{
      data: { global: { exclusions: unknown[] }[] }
    }>("/api/preferences", cookie)
    expect(prefs.data.global[0].exclusions).toHaveLength(1)
  })

  it("should seed the heavy_prefs persona's preference volume", async () => {
    const prefs = await getJson<{
      data: { channel: unknown[]; global: unknown[] }
    }>("/api/preferences", sessionCookie(await loginAs("heavy_prefs")))
    expect(prefs.data.channel).toHaveLength(60)
    expect(prefs.data.global).toHaveLength(20)
  })
})

describe("POST /api/__sandbox__/login overrides", () => {
  it("should replace the fixture's settings, then restore them on the next plain login", async () => {
    const cookie = sessionCookie(
      await loginAs("full", {
        notificationsPaused: true,
        language: "pt-BR",
        tokenState: "reconnect_required",
        mutedBroadcasterUserIds: ["sbx_bc_aurora"],
        preferences: {
          global: [
            {
              categoryId: "512953",
              excludedBroadcasterUserIds: ["sbx_bc_cinder"],
            },
          ],
        },
      }),
    )

    const me = await getJson<Me>("/api/me", cookie)
    expect(me.data).toMatchObject({
      language: "pt-BR",
      twitch_reconnect_required: true,
    })
    expect(me.data.notifications_paused_at).not.toBeNull()
    const prefs = await getJson<{
      data: {
        channel: unknown[]
        global: { category_name: string; exclusions: unknown[] }[]
      }
    }>("/api/preferences", cookie)
    expect(prefs.data.channel).toHaveLength(0)
    expect(prefs.data.global).toMatchObject([{ category_name: "Elden Ring" }])
    expect(prefs.data.global[0].exclusions).toHaveLength(1)

    const restored = await getJson<Me>(
      "/api/me",
      sessionCookie(await loginAs("full")),
    )
    expect(restored.data).toMatchObject({
      language: "en",
      notifications_paused_at: null,
      twitch_reconnect_required: false,
    })
  })

  it.each([
    ["an unsynced channel", { mutedBroadcasterUserIds: ["sbx_bc_ember"] }],
    ["an unknown category", { preferences: { global: [{ categoryId: "0" }] } }],
    ["an unknown key", { userId: "usr_other" }],
    ["a bad language", { language: "fr" }],
  ])("should reject %s with 400", async (_name, overrides) => {
    const res = await loginAs("full", overrides)
    expect(res.status).toBe(400)
  })
})
