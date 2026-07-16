import { nanoid } from "nanoid"
import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { importVapidSigningKey } from "../../services/push/web-push"
import { ApiError } from "../errors"
import { jsonResponse } from "../response"

// Standard `PushSubscription.toJSON()` shape (see ADR 0027).
const CreatePushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export async function handleGetVapidPublicKey(
  c: Context<HonoEnv>,
): Promise<Response> {
  // Fails fast with a descriptive message if the configured key isn't a real
  // P-256 pair, instead of letting the browser's PushManager.subscribe()
  // reject with an opaque InvalidAccessError further down the line.
  try {
    await importVapidSigningKey(c.var.config)
  } catch (error) {
    throw new ApiError(
      500,
      "vapid_not_configured",
      error instanceof Error ? error.message : "VAPID keys are not configured",
    )
  }

  return jsonResponse({
    data: { vapid_public_key: c.var.config.vapidPublicKey },
  })
}

export async function handleCreatePushSubscription(
  c: Context<HonoEnv>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null)
  const parsed = CreatePushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(
      400,
      "invalid_request",
      "Invalid push subscription payload",
    )
  }

  const { endpoint, keys } = parsed.data
  const now = new Date().toISOString()
  const userAgent = c.req.header("user-agent") ?? null

  // Idempotent upsert keyed by endpoint: a re-posted endpoint refreshes the
  // existing row (keys, owner, revocation) instead of failing the unique
  // constraint — the latest authenticated claimant wins (ADR 0027).
  const existing = await c.var.db.pushSubscriptions.findByEndpoint(endpoint)
  if (existing) {
    await c.var.db.pushSubscriptions.refresh({
      id: existing.id,
      userId: c.var.userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      now,
    })
    const record = await c.var.db.pushSubscriptions.findById(existing.id)
    return jsonResponse({ data: record })
  }

  const id = `psub_${nanoid()}`
  await c.var.db.pushSubscriptions.create({
    id,
    userId: c.var.userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent,
    now,
  })
  const record = await c.var.db.pushSubscriptions.findById(id)
  return jsonResponse({ data: record }, { status: 201 })
}

export async function handleDeletePushSubscription(
  c: Context<HonoEnv>,
): Promise<Response> {
  const id = c.req.param("id")
  const record = id ? await c.var.db.pushSubscriptions.findById(id) : null
  if (!record || record.user_id !== c.var.userId) {
    throw new ApiError(404, "not_found", "Push subscription not found")
  }

  // Soft revoke; repeating the delete is a no-op (ADR 0027).
  if (!record.revoked_at) {
    await c.var.db.pushSubscriptions.revoke(record.id, new Date().toISOString())
  }

  return new Response(null, { status: 204 })
}
