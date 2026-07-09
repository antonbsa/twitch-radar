# 0031 - EventSub Subscription Creation And Status Lifecycle

## Status

Accepted

## Context

T-006 stages local `eventsub_subscriptions` rows with `status: "pending"` (ADR 0030) and leaves creating them on Twitch to T-007. Open questions were which credential creates them, what triggers creation, and what the local `status` column means over a subscription's life. Twitch requires webhook-transport subscriptions to be created with an **app access token** (client credentials), not a user token, and confirms a new subscription asynchronously via a callback verification challenge.

## Decision

- **Creation contract:** `POST /helix/eventsub/subscriptions` with `{ type, version, condition: { broadcaster_user_id }, transport: { method: "webhook", callback, secret } }`, authenticated with an app access token. The callback URL is the one stored on the pending row (derived from `API_URL` at staging time); the secret is the single shared `EVENTSUB_WEBHOOK_SECRET` (`secret_version` stays `"1"` until a rotation scheme is needed).
- **App access token** (`services/twitch/app-token.ts`): client-credentials grant, cached in KV under `twitch:app_access_token` with a TTL of `expires_in` minus a 5-minute buffer. Also used wherever event processing needs Twitch data outside a user context (ADR 0033).
- **Trigger is a cron schedule, not the request path.** A `scheduled` handler (`triggers.crons: ["* * * * *"]`) runs `createPendingEventsubSubscriptions`, which picks up to 30 pending rows per run (subrequest-limit headroom) in insertion order and creates them on Twitch. Preference mutations therefore stay fast and Twitch-free; a new preference's subscriptions go live within about a minute. T-008's reconciliation job extends this same handler (status repair, removal of subscriptions for disabled broadcasters).
- **Status lifecycle** of a local row:
  - `pending` — staged locally (ADR 0030), not yet created on Twitch. A failed create logs and stays `pending` for the next run.
  - `webhook_callback_verification_pending` — created on Twitch (Twitch's returned initial status); `twitch_subscription_id` recorded.
  - `enabled` — set when the webhook answers Twitch's callback verification challenge for that `twitch_subscription_id`, mirroring the flip Twitch performs on its side.
  - revocation reasons (`authorization_revoked`, `notification_failures_exceeded`, `version_removed`, …) — copied verbatim from a `revocation` webhook message, with `revoked_at` set.

## Consequences

- Subscription creation is eventually consistent: a broadcaster is actually covered only after cron pickup plus challenge round-trip. Acceptable for an alerting MVP; the UI never promises instant coverage.
- Pending rows for broadcasters that were disabled before pickup are still created (creation does not re-check `monitored_channels.disabled_at`); T-008 reconciliation is the janitor that removes unneeded subscriptions, per ADR 0030.
- Local Twitch subscription counts are bounded by Twitch's max_total_cost for webhook subscriptions (10 000 by default) — the "subscription count grows with monitored broadcasters" risk from the architecture spec lives here.
- The API test tier triggers the cron deterministically via `wrangler dev --test-scheduled` and `GET /__scheduled`.
