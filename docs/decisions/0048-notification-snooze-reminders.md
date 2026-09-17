# 0048 - Notification Snooze Reminders

## Status

Accepted

## Context

Issue #23: a followed streamer switches into a desired category and a notification fires, but by the time the user checks the notification, the streamer might just be talking in that category rather than actively doing the thing the user cares about. The user wants a "remind me again in N minutes" action instead of only being able to dismiss.

Nothing like this exists today: `notification_deliveries` only tracks `pending → sent/failed/skipped` per user/broadcaster/category/trigger/stream (ADR 0034), there's no re-delivery/reminder scheduling, and the service worker's `notificationclick` handler (`apps/web/public/service-worker.js`) only focuses/opens a window — it has no notification actions (`actions: [...]` on `showNotification`) at all.

`notification_deliveries`' unique dedupe key (user, broadcaster, category, trigger, stream — ADR 0008) is deliberately built to prevent re-notifying for the same stream. A snooze is exactly the opposite: a deliberate, user-requested re-send for the same stream. Reusing that table for scheduling snoozes would fight the dedupe key it was built around.

## Decision

**New table `notification_snoozes`**, separate from `notification_deliveries`:

- `id`, `user_id`, `broadcaster_user_id`, `category_id`, `original_delivery_id` (FK to the `notification_deliveries` row that was snoozed), `fire_at`, `status` (`pending` / `fired` / `expired`), `created_at`.
- A pending row records only the intent to re-check later; it carries no payload of its own — the payload is rebuilt at fire time from live state, which is the entire point of a snooze.

**Duration is a fixed 15 minutes for MVP.** No user-selectable durations — matches the issue's own example and keeps scope minimal. `fire_at = now + 15m` at snooze time.

**Client (service worker):** `showNotification`'s options gain `actions: [{ action: "snooze", title: "Remind me in 15m" }]`. The push payload (`NotificationPayload`, `apps/api/src/types.ts`) gains a `deliveryId` field alongside the existing `{ title, body, url }`, threaded into `notification.data` so `notificationclick` has it available. On `event.action === "snooze"`, the handler does not focus/open a window — it fires `POST /api/notifications/:deliveryId/snooze` and closes the notification. The request is same-origin, so the session cookie (`SameSite=Lax`) rides along without extra credentials handling.

**Endpoint:** `POST /api/notifications/:deliveryId/snooze`, authenticated. Loads the delivery, 404s if it doesn't belong to the caller, 400s unless the delivery's status is `sent` (only a notification that actually reached a device is a meaningful thing to snooze). Idempotent: a second snooze request against a delivery that already has a `pending` snooze row returns the existing row rather than creating a duplicate. Otherwise inserts a `pending` `notification_snoozes` row with `fire_at = now + 15m`, copying `broadcaster_user_id`/`category_id` off the delivery.

**Sweep and re-send.** A new trigger type is added to `notification_deliveries.trigger_type`: `snooze_reminder`. This keeps the re-send on the existing audited pipeline without colliding with the original delivery's dedupe key (same user/broadcaster/category/stream, different trigger). The sweep:

1. Loads `notification_snoozes` rows where `status = 'pending' AND fire_at <= now` (bounded batch per run).
2. For each, reads the broadcaster's **current** `channel_state` — not a static replay of the original payload, since the whole point of a snooze is to reflect the streamer's state now.
3. If the channel is still live in the snoozed category, stages a fresh delivery via `notificationDeliveries.insertPendingIfNew` (trigger `snooze_reminder`, current `stream_id`) and enqueues it through the existing `NOTIFICATION_JOBS_QUEUE` / `deliverNotification` pipeline (ADR 0034), exactly like a normal match. The snooze row is marked `fired`.
4. Otherwise (offline, or switched to a different category) the snooze row is marked `expired` — no re-send.

**Cron wiring deviates from ADR 0036's "one cron per job."** ADR 0036's own notes record that Cloudflare's account-wide cron trigger cap (5) is already fully consumed: production runs 4 crons, preview runs 1. There is no free slot to give the sweep its own schedule without dropping an existing job's cadence. Since the sweep needs to run roughly every minute anyway to keep the 15-minute snooze window tight, it is dispatched from the existing default (minutely) branch of `scheduled()` in `apps/api/src/index.ts`, alongside `createPendingEventsubSubscriptions` — no new entry in `wrangler.jsonc`'s `triggers.crons`, no new `CRON_*` constant. This is a deliberate, budget-driven exception to ADR 0036's pattern, not a reversal of it: if a future job needs true isolation from the pending-subscription creation job's failure/latency envelope, the account-wide cap will need to be revisited first (e.g. dropping the `*/30` reconciliation schedule to free a slot).

## Consequences

- A snoozed reminder is a first-class, auditable delivery: it shows up in `notification_deliveries` with its own `snooze_reminder` trigger row, same terminal statuses (`sent`/`failed`/`skipped`) as any other notification, and is traceable back to the original delivery via `notification_snoozes.original_delivery_id`.
- A user can snooze the same notification only once at a time in practice — a second click while one snooze is already `pending` no-ops instead of stacking reminders — but nothing stops snoozing again once the first snooze has fired or expired (that reminder can itself be re-snoozed, since it is a normal `sent` delivery like any other).
- Because the sweep piggybacks on the existing minutely default cron, its failure mode is coupled to `createPendingEventsubSubscriptions`'s: a slow or throwing sweep run shares that invocation's subrequest budget and log noise instead of having its own isolated failure surface. Accepted as the cost of not having a spare cron slot.
- No offline/stream-ended handling beyond "not the desired category anymore": if the stream ends before the snooze fires, `channel_state.is_live` is false and the category check fails the same way a category switch would, so the row is marked `expired` — a single check covers both cases.
- Fixed 15-minute duration means no per-notification customization at MVP; a user-selectable duration would need either multiple notification actions or a follow-up UI and is out of scope here.
