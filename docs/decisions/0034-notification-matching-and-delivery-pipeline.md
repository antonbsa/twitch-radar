# 0034 - Notification Matching And Delivery Pipeline

## Status

Accepted

## Context

T-007 leaves `channel_state_changes` rows as the notification work queue: `stream_started`, `stream_ended`, and `category_changed` transitions (ADR 0033). ADR 0008 fixes the semantics (future matching transitions only, one delivery per user/broadcaster/category/trigger/stream) and ADR 0007 scopes global preferences to followed broadcasters. Open questions were where matching runs, how deliveries reach devices, and how replays (Twitch retries, queue redeliveries, crash recovery) are kept from double-notifying.

## Decision

Delivery is a two-stage pipeline across the two queues:

1. **Match and stage** (twitch-events consumer, `services/notifications/match.ts`): after `processTwitchEventMessage` resolves a message to its change row, the matcher derives the trigger — `stream_started` → `stream_started_in_category`, `category_changed` → `switched_into_category`, anything else (including a null next category) notifies nobody — and collects matching users: active per-channel preferences on (broadcaster, next category), plus active global preferences on the category filtered to followers of the broadcaster. The user set dedupes combined matches. Each matched user gets a `pending` row in `notification_deliveries` and a `NOTIFICATION_JOBS_QUEUE` message `{ deliveryId, userId, payload }`.
2. **Send** (notification-jobs consumer, `services/notifications/deliver.ts`): loads the delivery, sends the payload to the user's active push subscriptions (ADR 0035), and resolves the row to a terminal status: `sent` (at least one subscription accepted; records the first accepting subscription id and `sent_at`), `failed` (all sends failed; `error_message` carries per-endpoint context), or `skipped` (no active subscriptions).

Replay safety is layered so each stage may over-produce and the next stage absorbs it:

- The dedupe index on `notification_deliveries` (user, broadcaster, category, trigger, stream — ADR 0008) makes staging idempotent; a replayed change row re-inserts nothing.
- `processTwitchEventMessage` returns the pre-existing change row on a redelivered message, so matching re-runs after a crash between state processing and enqueue. Jobs are (re-)enqueued for any matched delivery still `pending`, recovering a crash between insert and enqueue.
- The sender only acts on `pending` deliveries, so a duplicate job no-ops.

The payload is the service-worker contract `{ title, body, url }` (ADR 0026): `"<name> is streaming <category>"` / `"<name> switched to <category>"`, body naming the followed-category reason, and `url: "/channels"` (the MVP has no per-channel route). It is computed at match time — where the change row and the broadcaster's `monitored_channels` names are already in hand — and carried in the job message; the delivery row stays the audit/dedupe record.

There is no automatic retry of push sends: a category alert delivered late is worse than one missed, and a retry after partial multi-device success would double-notify the surviving devices. Queue-level retries remain for infrastructure errors only (the consumer retries the message when D1/KV throws, before any send outcome is recorded).

## Consequences

- Every matched user/event pair leaves exactly one `notification_deliveries` row with a terminal status — the observability story for "did the notification go out" is one table.
- A user whose devices are all revoked still accrues `skipped` rows, preserving the audit trail without send attempts.
- With a null `stream_id` on the dedupe key SQLite treats rows as distinct; `category_changed` rows carry the live stream id in practice, so the window is theoretical.
- The payload rides the queue message, so a payload-format change deploys atomically with the matcher; replays after a deploy rebuild it from the change row anyway.
- A delivery can stay `pending` forever only if the job is lost after a successful enqueue and never replayed — accepted at MVP; a sweep can reap stale pending rows later if it matters.
