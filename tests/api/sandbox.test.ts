import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

async function loginAs(persona: unknown) {
  return fetch(`${orchestrator.baseUrl}/api/__sandbox__/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona }),
  })
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

  it.each(["full", "empty", "reconnect"])(
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
      data: { broadcaster_user_id: string; is_live: boolean }[]
    }>("/api/channels/followed", cookie)
    const ids = followed.data.map((c) => c.broadcaster_user_id).sort()
    expect(ids).toEqual([
      "sbx_bc_aurora",
      "sbx_bc_bytewolf",
      "sbx_bc_cinder",
      "sbx_bc_driftwood",
    ])
    expect(followed.data.filter((c) => c.is_live)).toHaveLength(2)

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
    expect(followed.data).toHaveLength(4)
  })
})
