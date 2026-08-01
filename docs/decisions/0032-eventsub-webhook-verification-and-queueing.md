# 0032 - EventSub Webhook Verification And Queueing

## Status

Accepted

## Context

ADR 0004 requires the webhook handler to verify HMAC signatures against the raw body, answer callback challenges, dedupe by message id, enqueue work, and respond quickly. This ADR fixes the concrete algorithm, response codes, dedupe keys, and the queue payload shape for `POST /api/webhooks/twitch/eventsub`.

## Decision

- **Verification algorithm:** compute `HMAC-SHA256(EVENTSUB_WEBHOOK_SECRET, messageId + messageTimestamp + rawBody)` and compare `sha256=<hex>` to the `Twitch-Eventsub-Message-Signature` header with a constant-time comparison. The raw body text is read before any parsing; JSON is only parsed after the signature passes. Missing EventSub headers, a failed comparison, or a message timestamp older than 10 minutes (replay guard, per Twitch guidance) are all rejected with `403 invalid_signature`.
- **Message types** (`Twitch-Eventsub-Message-Type`):
  - `webhook_callback_verification` → respond `200 text/plain` with the raw `challenge` string, and mark the local subscription row `enabled` (ADR 0031).
  - `revocation` → record Twitch's status + `revoked_at` on the local row, respond `204`.
  - `notification` → dedupe, enqueue, respond `204`. Notifications for event types this app never subscribes to are acknowledged with `204` (and logged) without enqueueing, so Twitch doesn't retry them.
  - unknown types → `204`, logged.
- **Dedupe at the webhook is best-effort:** KV key `eventsub:msg:<message id>` with a 10-minute TTL, checked before enqueue and written after. It exists to spare the queue from Twitch's retries; the _hard_ idempotency guarantee is the consumer's unique `channel_state_changes.eventsub_message_id` (ADR 0033), because KV is eventually consistent across edges.
- **Queue payload** (`TWITCH_EVENTS_QUEUE`, typed as `TwitchEventQueueMessage`): `{ messageId, eventType, messageTimestamp, receivedAt, event }` — a discriminated union on `eventType` carrying the parsed `event` object. `messageId` is the idempotency key; `messageTimestamp` (the Twitch header) drives stale-event ordering. The `subscription` envelope is not forwarded; nothing downstream needs it.
- **Ack semantics:** the events queue consumer acks/retries per message (not per batch), and its `max_batch_timeout` is 1 second — alerts are time-sensitive, so events are not held back waiting for a fuller batch.

## Consequences

- The route performs no authentication middleware; the HMAC signature is the authentication.
- All state mutation happens in the consumer; the webhook path does only verification, one KV read/write, and one queue send, keeping the response inside Twitch's timeout comfortably.
- A duplicate delivered to a different edge than the original can slip past the KV check and be enqueued twice; the consumer-level guard makes that harmless.
- Signed-but-malformed JSON returns `400 invalid_request`; Twitch treats non-2xx as a delivery failure and retries, which is the correct behavior if that ever happens.
