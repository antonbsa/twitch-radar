# Project Guidance

## Source Of Truth

For future implementation work, treat [spec/mvp/00. architecture.md](spec/mvp/00.%20architecture.md) as the primary source of truth.

The POC files and docs exist to prove browser/Web Push behavior only. Do not extend the POC architecture unless the user explicitly asks for POC-related work.

## Product Target

Build the MVP described in `spec/mvp/00. architecture.md`:

- Mobile-first PWA.
- Twitch OAuth connection.
- Followed Twitch channel sync.
- Followed channel list ordered like Twitch's sidebar:
  - live first
  - live ordered by viewer count descending
  - offline below
- Per-channel category notification preferences.
- Global category notification preferences.
- Web Push notifications when a followed channel starts streaming or switches into a desired category.

## Architecture Direction

Use the MVP serverless architecture:

- Cloudflare Pages for the PWA.
- Cloudflare Workers for API routes, Twitch OAuth callback, EventSub webhook receiver, and Web Push sending.
- Cloudflare D1 for durable relational state.
- Cloudflare Queues for async EventSub processing and notification jobs.
- Cloudflare KV only for short-lived cache such as app access tokens.
- Cloudflare Secrets for Twitch secrets, EventSub webhook secret, token encryption key, and VAPID private key.

Avoid carrying forward POC-only implementation choices:

- No Fastify backend for the MVP unless explicitly requested.
- No local JSON files as source-of-truth storage.
- No `setTimeout`-based scheduling.
- No in-memory channel state.
- No EventSub WebSocket listener for serverless deployment.

## Twitch EventSub Model

Use EventSub webhooks, not WebSockets.

Required event types for monitored broadcasters:

- `stream.online`
- `stream.offline`
- `channel.update`

Create EventSub subscriptions globally per unique broadcaster, not per user. Many user preferences should map to one broadcaster-level EventSub subscription set.

Webhook handlers must:

- Verify Twitch HMAC signatures using the raw request body.
- Handle callback verification challenges.
- Dedupe using Twitch EventSub message IDs.
- Enqueue processing work and respond quickly with `2XX`.

## State Model Principles

The MVP needs both current state and relevant history:

- `channel_state` is the current snapshot and is required for previous-vs-next comparisons.
- `channel_state_changes` is history/audit/deduplication and should store only meaningful transitions.

Do not use the history table as the only source of current state.

Meaningful transitions include:

- stream started
- stream ended
- category changed while live
- channel entered a desired category
- channel left a desired category

## Notification Rules

Notify when:

- a followed channel starts streaming in a desired category
- a followed channel switches into a desired category while live

Do not notify when:

- a channel goes offline
- an offline channel changes category
- a user creates a preference for a stream that is already live and already matching, unless the user explicitly changes this product decision

Deduplicate deliveries using `notification_deliveries`, with one delivery per user, broadcaster, category, stream, and trigger type.

## Implementation Order

Follow the MVP phases from the architecture spec:

1. Auth and PWA shell.
2. Preferences.
3. EventSub.
4. State and matching.
5. Notification delivery.

When implementation details are unclear, update or extend `spec/mvp/00. architecture.md` before coding broad changes.
