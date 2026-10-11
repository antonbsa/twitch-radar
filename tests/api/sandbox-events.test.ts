import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

const FULL_USER_ID = "usr_sandbox_full"
const MINECRAFT = "27471"
const ELDEN_RING = "512953"

async function loginAsFull(): Promise<string> {
  const res = await fetch(`${orchestrator.baseUrl}/api/__sandbox__/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona: "full" }),
  })
  return res.headers.get("set-cookie")!.split(";")[0]
}

/** Registers a push endpoint for the persona, as enabling push in the app would. */
async function registerPush(path: string) {
  await orchestrator.seed({
    user: {
      id: FULL_USER_ID,
      twitchUserId: "sbx_tw_full",
      twitchLogin: "sandbox_full",
      twitchDisplayName: "Sandbox Full",
    },
    pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint(path) }],
  })
}

function postEvent(cookie: string, body: Record<string, unknown>) {
  return fetch(`${orchestrator.baseUrl}/api/__sandbox__/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  })
}

describe("POST /api/__sandbox__/events", () => {
  it("should deliver a push when a live channel switches into a preferred category", async () => {
    const cookie = await loginAsFull()
    await registerPush("/push/sbx-switch")
    await orchestrator.mockTwitch.onPush("/push/sbx-switch")

    // aurora is live in Just Chatting; the persona has a global Minecraft preference.
    const res = await postEvent(cookie, {
      type: "switch_category",
      broadcasterUserId: "sbx_bc_aurora",
      categoryId: MINECRAFT,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { change_type: "category_changed", notified: true },
    })

    const state = await orchestrator.waitForInspect(
      ["sbx_bc_aurora"],
      (s) => s.notificationDeliveries.some((d) => d.status === "sent"),
      { userId: FULL_USER_ID },
    )
    expect(state.channelState[0]).toMatchObject({
      is_live: true,
      category_id: MINECRAFT,
    })
    expect(state.notificationDeliveries[0]).toMatchObject({
      user_id: FULL_USER_ID,
      trigger_type: "switched_into_category",
      status: "sent",
    })
    expect(state.notificationDeliveries[0].push_subscription_id).toBe(
      state.pushSubscriptions[0].id,
    )
  })

  it("should take an offline channel live in the chosen category and notify", async () => {
    const cookie = await loginAsFull()
    await orchestrator.mockTwitch.onAppToken()
    // Get Streams has nothing for an offline channel.
    await orchestrator.mockTwitch.onStreams([])

    // cinder is offline; the persona has a per-channel Elden Ring preference.
    const res = await postEvent(cookie, {
      type: "go_live",
      broadcasterUserId: "sbx_bc_cinder",
      categoryId: ELDEN_RING,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { change_type: "stream_started", notified: true },
    })

    const state = await orchestrator.inspect(["sbx_bc_cinder"])
    expect(state.channelState[0]).toMatchObject({
      is_live: true,
      category_id: ELDEN_RING,
    })
    expect(state.notificationDeliveries[0]).toMatchObject({
      trigger_type: "stream_started_in_category",
    })
  })

  it("should not notify when no preference matches the category", async () => {
    const cookie = await loginAsFull()

    const res = await postEvent(cookie, {
      type: "switch_category",
      broadcasterUserId: "sbx_bc_aurora",
      categoryId: "516575",
    })
    await expect(res.json()).resolves.toEqual({
      data: { change_type: "category_changed", notified: false },
    })
  })

  it("should reject a category switch on a channel that is not live", async () => {
    const cookie = await loginAsFull()

    const res = await postEvent(cookie, {
      type: "switch_category",
      broadcasterUserId: "sbx_bc_driftwood",
      categoryId: MINECRAFT,
    })
    expect(res.status).toBe(409)
  })

  it("should reject a channel the persona has not synced yet", async () => {
    const cookie = await loginAsFull()

    const res = await postEvent(cookie, {
      type: "go_live",
      broadcasterUserId: "sbx_bc_ember",
      categoryId: MINECRAFT,
    })
    expect(res.status).toBe(404)
  })

  it("should reject an unknown category", async () => {
    const cookie = await loginAsFull()

    const res = await postEvent(cookie, {
      type: "go_live",
      broadcasterUserId: "sbx_bc_cinder",
      categoryId: "nope",
    })
    expect(res.status).toBe(400)
  })

  it("should reject a signed-in user who is not a persona", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const res = await postEvent(cookie, {
      type: "go_live",
      broadcasterUserId: "sbx_bc_cinder",
      categoryId: MINECRAFT,
    })
    expect(res.status).toBe(403)
  })

  it("should require a session", async () => {
    const res = await postEvent("", {
      type: "go_live",
      broadcasterUserId: "sbx_bc_cinder",
      categoryId: MINECRAFT,
    })
    expect(res.status).toBe(401)
  })
})
