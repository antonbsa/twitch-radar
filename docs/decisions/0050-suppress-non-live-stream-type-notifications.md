# 0050 - Suppress Notifications For Non-Live Stream Types

## Status

Accepted

## Context

Issue #38 item 1: Twitch's `stream.online` event and the Get Streams API both carry a `type` field (`"live"` / `"rerun"` / `"playlist"` / `"watch_party"`), declared on `StreamOnlineEventPayload`/`TwitchStream` but never read. `matchAndCreateDeliveries` notifies on every `stream_started`/`category_changed` transition regardless of this value, so a rerun or playlist broadcast pages users exactly as if the streamer were live — the thing the notification exists to signal isn't actually true.

`channel_state` had nowhere to persist this: only `channel_state_changes` transitions were available to the matcher, and that table only exists to explain _what changed_, not to carry a fact about the _current_ stream that every future transition needs to see again.

## Decision

- Add `channel_state.stream_type` (nullable text), written by `processStreamOnline` from `stream?.type ?? event.type` (Get Streams may lag behind the event; the event's own `type` is the fallback). `processStreamOffline` and `processChannelUpdate` carry the existing value forward unchanged — neither has a stream to type.
- `matchAndCreateDeliveries` reads the broadcaster's current `channel_state` row (already needed for body composition, item 4) and returns before staging any delivery when `stream_type` is set and not `"live"`. This suppresses both `stream_started_in_category` and `category_changed` transitions for the same reason: a category switch during a rerun is just as uninformative as the rerun starting.
- **`null`/unknown `stream_type` is treated as live, not suppressed.** Rows written before this migration have no value here; treating that as "unknown, so don't notify" would silently break notifications for every channel already being monitored until their next `stream.online`. Treating it as live keeps existing behavior for those rows and only starts suppressing once a real non-live type is observed.
- `channel_state_changes` is not touched — suppression is a live-state check at match time, not a property of the transition being recorded, so the audit trail still shows the transition happened even though no one was notified about it.

## Consequences

- A rerun/playlist/watch_party broadcast produces `channel_state_changes` rows as before (for audit/debugging) but never a `notification_deliveries` row.
- `matchAndCreateDeliveries` now does one extra `channel_state` read per change row; it was already the cheapest table to query here (`findByBroadcasterUserId`, primary-key lookup).
- If Twitch ever adds a new `type` value this project should still treat as live, it needs handling explicitly (an allowlist, or checking a different signal) — the current check is a denylist of one string (`!== "live"`), which favors not-missing-a-suppression over not-missing-a-notification.
