# 0048 - Notification Snooze Reminders

## Status

Accepted

## Context

Issue #23: a followed streamer switches into a desired category and a notification fires, but by the time the user checks the notification, the streamer might just be talking in that category rather than actively doing the thing the user cares about. The user wants a "remind me again in N minutes" action instead of only being able to dismiss.

Nothing like this exists today: `notification_deliveries` only tracks `pending → sent/failed/skipped` per user/broadcaster/category/trigger/stream (ADR 0034), there's no re-delivery/reminder scheduling, and the service worker's `notificationclick` handler (`apps/web/public/service-worker.js`) only focuses/opens a window — it has no notification actions (`actions: [...]` on `showNotification`) at all.

`notification_deliveries`' unique dedupe key (user, broadcaster, category, trigger, stream — ADR 0008) is deliberately built to prevent re-notifying for the same stream. A snooze is exactly the opposite: a deliberate, user-requested re-send for the same stream. Reusing that table for scheduling snoozes would fight the dedupe key it was built around.

A reminder request is not tied to any specific past notification. The user is simply asking "remind me about this broadcaster/category in 15 minutes" — whether or not they were ever notified about it before, and regardless of how they got to the channel (a notification tap, or just browsing). Scoping the feature around a specific `notification_deliveries` row would only add friction (no delivery, no button) for no real benefit.

## Decision

**New table `notification_snoozes`**, separate from `notification_deliveries`:

- `id`, `user_id`, `broadcaster_user_id`, `category_id`, `fire_at`, `status` (`pending` / `fired` / `expired`), `created_at`.
- A pending row records only the intent to re-check later; it carries no payload of its own — the payload is rebuilt at fire time from live state, which is the entire point of a snooze.
- Not tied to any `notification_deliveries` row — a reminder can be requested for a broadcaster/category the user was never actually notified about.

**Duration is a fixed 15 minutes for MVP.** No user-selectable durations — matches the issue's own example and keeps scope minimal. `fire_at = now + 15m` at request time.

**Endpoint:** `POST /api/notifications/snooze`, authenticated, body `{ broadcaster_user_id, category_id }`. No ownership or delivery-status check — any authenticated user can request a reminder for any broadcaster/category pair, the same way "notify me" preferences aren't gated on anything either. Idempotent: a second request while a `pending` reminder already exists for the same user/broadcaster/category returns that row rather than creating a duplicate (`idx_notification_snoozes_user_broadcaster_category`).

**Two entry points, same endpoint:**

- **Push notification action (Android/desktop):** `showNotification`'s options gain `actions: [{ action: "snooze", title: "Remind me in 15m" }]` whenever the payload carries a broadcaster/category. The push payload (`NotificationPayload`, `apps/api/src/types.ts`) gains `broadcasterUserId`/`categoryId` fields, threaded into `notification.data` so `notificationclick` has them available without needing to look anything up. On `event.action === "snooze"`, the handler does not focus/open a window — it POSTs the JSON body to `/api/notifications/snooze` and closes the notification. Same-origin, so the session cookie (`SameSite=Lax`) rides along without extra credentials handling.
- **Channel detail modal (`apps/web/src/components/channel-detail-modal.tsx`):** a secondary "Remind me in 15m" button next to "Watch on Twitch", shown whenever the channel is currently live (same condition already gating the "Notify me" button) — regardless of how the modal was opened. This is not an iOS fallback for the push action; it's the button's default, always-available home. It calls the same endpoint with `channel.broadcaster_user_id`/`channel.category_id`, both already available as props. Buttons stack vertically full-width on mobile and sit side by side centered on desktop.

**Sweep and re-send.** A new trigger type is added to `notification_deliveries.trigger_type`: `snooze_reminder`. This keeps the re-send on the existing audited pipeline without colliding with any delivery's dedupe key (same user/broadcaster/category/stream, different trigger). The sweep:

1. Loads `notification_snoozes` rows where `status = 'pending' AND fire_at <= now` (bounded batch per run).
2. For each, reads the broadcaster's **current** `channel_state` — not a static replay of anything, since the whole point of a snooze is to reflect the streamer's state now.
3. If the channel is live in the snoozed category, stages a fresh delivery via `notificationDeliveries.insertPendingIfNew` (trigger `snooze_reminder`, current `stream_id`) and enqueues it through the existing `NOTIFICATION_JOBS_QUEUE` / `deliverNotification` pipeline (ADR 0034), exactly like a normal match. The snooze row is marked `fired`.
4. Otherwise (offline, never went live in that category, or moved to a different one) the snooze row is marked `expired` — no re-send.

**Cron wiring deviates from ADR 0036's "one cron per job."** ADR 0036's own notes record that Cloudflare's account-wide cron trigger cap (5) is already fully consumed: production runs 4 crons, preview runs 1. There is no free slot to give the sweep its own schedule without dropping an existing job's cadence. Since the sweep needs to run roughly every minute anyway to keep the 15-minute snooze window tight, it is dispatched from the existing default (minutely) branch of `scheduled()` in `apps/api/src/index.ts`, alongside `createPendingEventsubSubscriptions` — no new entry in `wrangler.jsonc`'s `triggers.crons`, no new `CRON_*` constant. This is a deliberate, budget-driven exception to ADR 0036's pattern, not a reversal of it: if a future job needs true isolation from the pending-subscription creation job's failure/latency envelope, the account-wide cap will need to be revisited first (e.g. dropping the `*/30` reconciliation schedule to free a slot).

## Consequences

- A fired reminder is a first-class, auditable delivery: it shows up in `notification_deliveries` with its own `snooze_reminder` trigger row, same terminal statuses (`sent`/`failed`/`skipped`) as any other notification. It has no link back to any originating delivery, because there isn't necessarily one.
- A user can have only one pending reminder per broadcaster/category at a time — a repeated request while one is already `pending` no-ops instead of stacking reminders — but nothing stops requesting again once the first has fired or expired.
- A reminder can be requested for a channel that turns out to be offline or in a different category by the time the sweep runs (or even at request time, since the endpoint doesn't validate current live state) — it simply expires with no re-send. This is intentional: validating at request time would only add a rejection path for no real benefit, since the sweep already re-checks live state regardless.
- Because the sweep piggybacks on the existing minutely default cron, its failure mode is coupled to `createPendingEventsubSubscriptions`'s: a slow or throwing sweep run shares that invocation's subrequest budget and log noise instead of having its own isolated failure surface. Accepted as the cost of not having a spare cron slot.
- Fixed 15-minute duration means no per-notification customization at MVP; a user-selectable duration would need either multiple notification actions or a follow-up UI and is out of scope here.
