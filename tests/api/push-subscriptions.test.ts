import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

const SUBSCRIPTION_BODY = {
  endpoint: "https://push.example.com/send/abc123",
  keys: { p256dh: "p256dh-key-material", auth: "auth-secret" },
}

async function createSubscription(
  cookie: string,
  body: unknown = SUBSCRIPTION_BODY,
) {
  return fetch(`${orchestrator.baseUrl}/api/push-subscriptions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/push/vapid-public-key", () => {
  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/push/vapid-public-key`)
    expect(res.status).toBe(401)
  })

  it("should return the configured VAPID public key", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/push/vapid-public-key`,
      { headers: { Cookie: cookie } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { vapid_public_key: string }
    }
    // .env.development's placeholder is a well-formed 87-char base64url key.
    expect(body.data.vapid_public_key).toHaveLength(87)
  })
})

describe("POST /api/push-subscriptions", () => {
  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/push-subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SUBSCRIPTION_BODY),
    })
    expect(res.status).toBe(401)
  })

  it("should create and store a subscription for the authenticated user", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    const res = await createSubscription(cookie)
    expect(res.status).toBe(201)

    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user_id: userId,
      endpoint: SUBSCRIPTION_BODY.endpoint,
      p256dh: SUBSCRIPTION_BODY.keys.p256dh,
      auth: SUBSCRIPTION_BODY.keys.auth,
      revoked_at: null,
    })
    expect(body.data.id).toMatch(/^psub_/)
  })

  it("should upsert idempotently when the same endpoint is posted again", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const first = await createSubscription(cookie)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { data: { id: string } }

    const second = await createSubscription(cookie, {
      ...SUBSCRIPTION_BODY,
      keys: { p256dh: "rotated-p256dh", auth: "rotated-auth" },
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as {
      data: { id: string; p256dh: string }
    }
    expect(secondBody.data.id).toBe(firstBody.data.id)
    expect(secondBody.data.p256dh).toBe("rotated-p256dh")
  })

  it("should reactivate a revoked subscription on re-post", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const created = await createSubscription(cookie)
    const { data } = (await created.json()) as { data: { id: string } }

    const deleted = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/${data.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(deleted.status).toBe(204)

    const reposted = await createSubscription(cookie)
    expect(reposted.status).toBe(200)
    const repostedBody = (await reposted.json()) as {
      data: { id: string; revoked_at: string | null }
    }
    expect(repostedBody.data.id).toBe(data.id)
    expect(repostedBody.data.revoked_at).toBeNull()
  })

  it("should reassign an endpoint claimed by another user", async () => {
    const userA = await orchestrator.createAuthenticatedSession({
      id: "usr_push_a",
      twitchUserId: "twitch_push_a",
    })
    await createSubscription(userA.cookie)

    const userB = await orchestrator.createAuthenticatedSession({
      id: "usr_push_b",
      twitchUserId: "twitch_push_b",
    })
    const res = await createSubscription(userB.cookie)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { user_id: string } }
    expect(body.data.user_id).toBe(userB.userId)
  })

  it("should reject a malformed payload with 400 invalid_request", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    for (const payload of [
      {},
      { endpoint: "not-a-url", keys: SUBSCRIPTION_BODY.keys },
      { endpoint: SUBSCRIPTION_BODY.endpoint, keys: { p256dh: "x" } },
    ]) {
      const res = await createSubscription(cookie, payload)
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("invalid_request")
    }
  })
})

describe("DELETE /api/push-subscriptions/:id", () => {
  it("should return 401 without a session", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/psub_x`,
      { method: "DELETE" },
    )
    expect(res.status).toBe(401)
  })

  it("should revoke an owned subscription and be idempotent", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const created = await createSubscription(cookie)
    const { data } = (await created.json()) as { data: { id: string } }

    const first = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/${data.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(first.status).toBe(204)

    const again = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/${data.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(again.status).toBe(204)
  })

  it("should return 404 for an unknown id", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/psub_missing`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("not_found")
  })

  it("should return 404 when the subscription belongs to another user", async () => {
    const owner = await orchestrator.createAuthenticatedSession({
      id: "usr_push_owner",
      twitchUserId: "twitch_push_owner",
    })
    const created = await createSubscription(owner.cookie)
    const { data } = (await created.json()) as { data: { id: string } }

    const intruder = await orchestrator.createAuthenticatedSession({
      id: "usr_push_intruder",
      twitchUserId: "twitch_push_intruder",
    })
    const res = await fetch(
      `${orchestrator.baseUrl}/api/push-subscriptions/${data.id}`,
      { method: "DELETE", headers: { Cookie: intruder.cookie } },
    )
    expect(res.status).toBe(404)
  })
})
