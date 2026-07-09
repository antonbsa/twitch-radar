# 0033 - EventSub State Transition Rules

## Status

Accepted

## Context

ADR 0006 splits current state (`channel_state`) from relevant history (`channel_state_changes`) and requires event processing to load previous state before writing next state. This ADR fixes the concrete transition rules per EventSub type, the idempotency mechanics, and how out-of-order deliveries are handled — EventSub does not guarantee ordering, and Twitch retries can arrive minutes later.

## Decision

The queue consumer (`services/eventsub/process.ts`) applies each message as: idempotency check → load previous state → stale guard → write next `channel_state` → insert `channel_state_changes` row if the transition is relevant.

- **Idempotency:** a message whose id already exists in `channel_state_changes.eventsub_message_id` is skipped, and change inserts use on-conflict-do-nothing on that unique column. This is the hard guarantee behind the webhook's best-effort KV dedupe (ADR 0032).
- **Stale guard:** `channel_state.updated_from_event_at` stores the Twitch message timestamp of the event that last wrote the row. A message strictly older than it is dropped entirely (state and history), so a late retry can't overwrite newer state or fabricate a transition. Seeded rows (ADR 0030) leave the column null, so the first real event always processes. Equal timestamps process — exact duplicates are already caught by message id.
- **State is written before the change row.** If a crash loses the change insert, `channel_state` (the source of truth) is still correct and a redelivery is a no-op for state; a transition record can be lost in that rare window, never duplicated.
- **`stream.online`:** the payload has no category, so the consumer fetches the stream from Get Streams with the app token (ADR 0031); if Twitch's read side lags the event, it falls back to the last known channel info and the event's `id`/`started_at`. Records `stream_started` only for a genuinely new stream — previous state offline, no state row, or a different `stream_id` (a missed offline). An online event for the stream already recorded as live (e.g. seeded at preference creation) only refreshes state, honoring ADR 0008's future-transitions-only rule.
- **`channel.update`:** category and title are channel info that exists offline, so state is updated live or offline (keeping `channel_state` the current snapshot for the next `stream.online` fallback). A `category_changed` row is recorded only while live and only when the category actually changed; title-only updates and offline category changes produce no history and therefore no notification work. Twitch's empty-string category is normalized to null.
- **`stream.offline`:** clears stream-scoped fields (`stream_id`, `viewer_count`, `started_at`) and keeps category/title (channel info). Records `stream_ended` only if the channel was previously live.
- **Change rows** carry `change_type` ∈ {`stream_started`, `stream_ended`, `category_changed`} plus previous/next is_live and category pairs, `stream_id`, and `occurred_at` (the Twitch message timestamp). ADR 0006's "entered/left a desired category" are not distinct row types: they are per-user judgments T-008 derives by matching a row's previous/next categories against preferences.

## Consequences

- `channel_state_changes` stays small and meaningful: no rows for refreshes, title changes, offline category flips, or already-known streams.
- Processing events for broadcasters with no state row works (treated as offline baseline), so a webhook arriving before seeding completes is safe.
- One Get Streams call per `stream.online` message; acceptable at MVP scale and batchable later if needed.
- The stale guard is per broadcaster, not per event type — a newer `channel.update` write drops an older retried `stream.online`, which is correct because the newer event already reflected the later reality.
