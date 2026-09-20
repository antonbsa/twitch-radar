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
  - `notification` → enqueue unconditionally, respond `204`. Notifications for event types this app never subscribes to are acknowledged with `204` (and logged) without enqueueing, so Twitch doesn't retry them.
  - unknown types → `204`, logged.
- **Dedupe is solely the consumer's D1 check:** the webhook enqueues every verified `notification` without a dedupe step of its own. The _hard_ idempotency guarantee is, and always was, the consumer's unique `channel_state_changes.eventsub_message_id` lookup (`findByEventsubMessageId` + no-op `insertIfNew`, ADR 0033). An earlier version of this ADR also required a best-effort webhook-level dedupe (KV key `eventsub:msg:<message id>`, 10-minute TTL) checked before enqueue. That layer was removed (issue #76): it was redundant with the D1 guarantee that already held, it did not even reliably avoid a duplicate enqueue because KV is eventually consistent across edges, and its one `KV_APP_CACHE.put` per notification was the single largest contributor to the account's KV free-tier write quota (channel.update firing repeatedly during a live stream, doubled across the production and preview deployments).
- **Queue payload** (`TWITCH_EVENTS_QUEUE`, typed as `TwitchEventQueueMessage`): `{ messageId, eventType, messageTimestamp, receivedAt, event }` — a discriminated union on `eventType` carrying the parsed `event` object. `messageId` is the idempotency key; `messageTimestamp` (the Twitch header) drives stale-event ordering. The `subscription` envelope is not forwarded; nothing downstream needs it.
- **Ack semantics:** the events queue consumer acks/retries per message (not per batch), and its `max_batch_timeout` is 1 second — alerts are time-sensitive, so events are not held back waiting for a fuller batch.

## Consequences

- The route performs no authentication middleware; the HMAC signature is the authentication.
- All state mutation happens in the consumer; the webhook path does only verification and one queue send, keeping the response inside Twitch's timeout comfortably and touching no KV binding at all.
- A duplicate Twitch delivery (retry or cross-edge redelivery) now always costs an extra queue message instead of being cut at the edge; the consumer-level guard makes that harmless, and the Queues free tier (1M operations/month) absorbs it as a rounding error at current volume.
- Signed-but-malformed JSON returns `400 invalid_request`; Twitch treats non-2xx as a delivery failure and retries, which is the correct behavior if that ever happens.
