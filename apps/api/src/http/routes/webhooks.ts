import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import type { TwitchEventQueueMessage } from "../../types"
import {
  MONITORED_EVENT_TYPES,
  type MonitoredEventType,
} from "../../db/repositories/eventsub-subscriptions"
import { verifyEventsubSignature } from "../../services/eventsub/verify"
import { ApiError } from "../errors"

// Twitch guidance: treat messages older than 10 minutes as replays.
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000

// Best-effort webhook-level dedupe window for Twitch retries. The hard
// guarantee lives in the consumer (unique eventsub_message_id, ADR 0033).
const MESSAGE_DEDUPE_TTL_SECONDS = 10 * 60

interface EventsubWebhookBody {
  challenge?: string
  subscription?: { id?: string; type?: string; status?: string }
  event?: unknown
}

function isMonitoredEventType(type: unknown): type is MonitoredEventType {
  return MONITORED_EVENT_TYPES.includes(type as MonitoredEventType)
}

/**
 * Twitch EventSub webhook entry point (ADR 0032). Verifies the HMAC
 * signature against the raw body before trusting anything, answers callback
 * verification challenges, records revocations, and enqueues notifications
 * for async processing so the response stays fast.
 */
export async function handleEventsubWebhook(
  c: Context<HonoEnv>,
): Promise<Response> {
  const rawBody = await c.req.text()
  const messageId = c.req.header("Twitch-Eventsub-Message-Id")
  const messageType = c.req.header("Twitch-Eventsub-Message-Type")
  const timestamp = c.req.header("Twitch-Eventsub-Message-Timestamp")
  const signature = c.req.header("Twitch-Eventsub-Message-Signature")

  if (!messageId || !messageType || !timestamp || !signature) {
    throw new ApiError(403, "invalid_signature", "Missing EventSub headers")
  }

  const signatureValid = await verifyEventsubSignature(
    c.var.config.eventsubWebhookSecret,
    messageId,
    timestamp,
    rawBody,
    signature,
  )
  if (!signatureValid) {
    throw new ApiError(
      403,
      "invalid_signature",
      "Signature verification failed",
    )
  }

  const messageAgeMs = Date.now() - Date.parse(timestamp)
  if (Number.isNaN(messageAgeMs) || messageAgeMs > MAX_MESSAGE_AGE_MS) {
    throw new ApiError(403, "invalid_signature", "Message timestamp too old")
  }

  let body: EventsubWebhookBody
  try {
    body = JSON.parse(rawBody) as EventsubWebhookBody
  } catch {
    throw new ApiError(400, "invalid_request", "Malformed webhook body")
  }

  const now = new Date().toISOString()

  if (messageType === "webhook_callback_verification") {
    // Answering the challenge is what flips the subscription to enabled on
    // Twitch's side, so mirror that locally (ADR 0031).
    if (body.subscription?.id) {
      await c.var.db.eventsubSubscriptions.markVerified(
        body.subscription.id,
        now,
      )
    }
    return new Response(body.challenge ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  }

  if (messageType === "revocation") {
    if (body.subscription?.id) {
      await c.var.db.eventsubSubscriptions.markRevoked(
        body.subscription.id,
        body.subscription.status ?? "revoked",
        now,
      )
    }
    return new Response(null, { status: 204 })
  }

  if (messageType === "notification") {
    const eventType = body.subscription?.type
    if (!isMonitoredEventType(eventType)) {
      // Ack so Twitch doesn't retry an event type we'll never process.
      console.warn("Ignoring unmonitored EventSub type", { eventType })
      return new Response(null, { status: 204 })
    }

    const dedupeKey = `eventsub:msg:${messageId}`
    const alreadySeen = await c.env.APP_CACHE.get(dedupeKey)
    if (!alreadySeen) {
      await c.env.TWITCH_EVENTS_QUEUE.send({
        messageId,
        eventType,
        messageTimestamp: timestamp,
        receivedAt: now,
        event: body.event,
      } as TwitchEventQueueMessage)
      await c.env.APP_CACHE.put(dedupeKey, "1", {
        expirationTtl: MESSAGE_DEDUPE_TTL_SECONDS,
      })
    }
    return new Response(null, { status: 204 })
  }

  console.warn("Ignoring unknown EventSub message type", { messageType })
  return new Response(null, { status: 204 })
}
