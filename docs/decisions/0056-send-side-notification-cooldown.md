# 0056 - Send-Side Notification Cooldown Per User And Broadcaster

## Status

Accepted

## Context

Issue #92: the dedupe key on `notification_deliveries` (user, broadcaster, category, trigger, stream; ADR 0008) doesn't stop repeat pushes about the same broadcaster:

- A stream that drops and reconnects gets a new `stream_id`, so it notifies again, unbounded.
- A broadcaster cycling through categories (A→B→C→D) notifies at every step; only an exact return to A on the same stream is blocked.
- `stream_started_in_category` and `switched_into_category` for what reads as one event are different `trigger_type` values and both notify.

Display-side collapsing already exists: the service worker sets `tag: broadcasterUserId` with `renotify` (issue #38, PR #97), so repeat notifications from one broadcaster replace each other on screen. That doesn't reduce how many pushes are sent, delivered and buzzed on the device. ADR 0051 (non-live suppression) was the other half of #38 and is unrelated to throttling. Nothing throttles on the send side today.

## Decision

**A fixed 15-minute cooldown per (user, broadcaster) in `matchAndCreateDeliveries`.** Before staging a delivery for a matched user, look up that user's most recent `sent` delivery for the broadcaster (`findLastSentByUserAndBroadcaster`); if its `sent_at` is within the last 15 minutes, skip the user. Nothing is staged, enqueued, or written as `skipped`, like the other match-time filters (ADR 0051, ADR 0054).

- **Window:** 15 minutes, a constant in code, aligned with the snooze interval (ADR 0048). Not configurable per user.
- **Scope:** deliberately not scoped to category, trigger type or stream. Ignoring category is the only way to cover category cycling, ignoring stream covers reconnects, and ignoring trigger covers `stream_started` plus `switched` for one event, so one rule handles all three cases.
- **Only `sent` counts.** `pending`, `failed` and `skipped` deliveries never started a cooldown: the user wasn't actually notified.
- **Order:** the cooldown runs last in the per-user filtering, after ADR 0054's order (non-live, global exclusions, pause, mute), so users that something else would drop never need the lookup.
- **Snooze reminders are exempt.** `sweepNotificationSnoozes` doesn't consult the cooldown: a reminder is an explicit user request and must arrive even right after a notification (ADR 0048). A delivered reminder is a `sent` row, so it does start a cooldown for later automatic matches.
- **Division of labor with #38:** display-side collapsing (`tag`/`renotify`) belongs to #38 and stays in the service worker; send-side throttling belongs to this ADR. They are complementary and share no logic.

**Storage:** index `idx_notification_deliveries_cooldown` on `(user_id, broadcaster_user_id, status, sent_at)` serves the lookup.

## Consequences

- A genuine change the user would care about (the broadcaster moves from category A to a different desired category B five minutes later) is dropped. Accepted: the issue treats notification volume per broadcaster as the problem, and the user still sees the channel's current state in the app.
- The suppressed event leaves no row in `notification_deliveries`; `channel_state_changes` still records the transition.
- The lookup runs per matched user, an indexed read. It only sees `sent` rows, so two matches processed before the first delivery is marked `sent` (queue latency, seconds) both pass. Counting `pending` rows would close that but would let a stuck delivery suppress a user, so it's not done.
- The cooldown is measured from the last send, not extended by suppressed events: a flapping broadcaster notifies at most once per 15 minutes.
