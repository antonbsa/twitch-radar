# 0055 - Client-Side Notification Digest

## Status

Rejected. Implemented and tried by hand on an installed iOS PWA: `getNotifications()` lists nothing there, notifications can't be replaced by `tag` or closed, and offline bursts lose pushes at the push service. See [TN 0007](../notes/0007-client-side-notification-digest-not-viable-on-ios.md).

## Context

Issue #117: pushes are sent with a 1h TTL (ADR 0035), so a device that was offline gets every notification that piled up once it reconnects. That's a burst of separate notifications about different broadcasters, each buzzing the device and taking a slot in the tray. Several followed channels going live in the same minute causes the same thing on a smaller scale.

Existing collapsing only works per broadcaster: the service worker's `tag: broadcasterUserId` (issue #38) replaces repeat notifications from the same broadcaster on display, and issue #92 adds a send-side cooldown for repeats from the same broadcaster. Nothing merges notifications across broadcasters.

There are two places to aggregate: on the server, by holding staged deliveries for a window and sending one combined push, or in the service worker, by merging what is already visible on the device.

## Decision

**Aggregate in the service worker, not on the server.** The delivery pipeline (ADR 0034) stays one push per matched delivery, sent as soon as it is staged.

A server-side window was rejected. It adds its latency to every notification to save pushes only in bursts, against ADR 0034's premise that a late category alert is worse than a missed one. It also breaks the one-delivery-one-push audit model in `notification_deliveries`, and still can't merge the offline case: those pushes were already sent and are sitting in the push service. Batching per queue batch costs no latency but merges nothing in practice, because the notification-jobs consumer flushes after 1s with at most 10 messages, across all users.

**Rule.** On `push`, the service worker counts the app's visible alert notifications (`registration.getNotifications()`), including the incoming one. At 3 or more it closes the individual alerts and shows one digest notification (`tag: "digest"`): a count title, "Name (Category)" entries most recent first truncated with "+K", no image, no actions, tapping it opens `/channels`. A later alert while the digest is visible updates it in place. The update is silent if the digest last changed under ~10s ago (same burst) and re-alerts otherwise, so a new event after the burst isn't swallowed.

**Alerts vs reminders.** `NotificationPayload` carries `kind: "alert" | "reminder"`. Snooze reminders (ADR 0048) are something the user explicitly asked for, so they are never counted toward the threshold, absorbed into the digest or used to update it. The field is explicit so the digest doesn't depend on i18n key names.

**Concurrency.** `push` handlers are serialized through a module-scoped promise chain. A burst fires them nearly together, and without the chain each would read the visible notifications before the others had shown theirs.

**Fallback.** Where `getNotifications()` is missing or doesn't report visible notifications (unverified on installed iOS PWAs), the worker keeps today's one-notification-per-push behavior.

**Code layout.** The pure decision logic lives in `apps/web/public/notification-digest.js`, loaded with `importScripts()` because the service worker is a classic script with no build step (ADR 0026), and is unit-tested directly.

## Consequences

- No pipeline, schema or audit change: `notification_deliveries` still records one delivery per push, and a digest is purely a presentation of pushes that already arrived.
- Each push in a burst is still delivered and wakes the worker. Only the first ones and any update after the ~10s window re-alert the device. Cutting the number of pushes in the offline case is issue #118's job (`Topic` header at the push service), not this one's.
- The digest has no per-channel actions. Watch and Remind need a single broadcaster, so a user who wants them opens `/channels`.
- A snooze reminder for a broadcaster that is part of the digest shows as its own notification next to it.
- If iOS doesn't support `getNotifications()` in this context, iOS users keep the current behavior. The digest still helps Android and desktop.
