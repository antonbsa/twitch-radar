# 0027 - Push Subscription Lifecycle And API Contract

## Status

Accepted

## Context

T-005 stores browser Push API subscriptions per authenticated user (`push_subscriptions`, one row per browser/device endpoint). Several lifecycle questions needed a decision:

- How the client obtains the VAPID public key it must pass to `pushManager.subscribe()`.
- What happens when the same endpoint is posted twice (page reload, cleared local state, or a user re-enabling after a disable).
- Whether "remove a subscription" deletes the row or marks it.
- How the client rediscovers the server-side id for a browser subscription it already holds.

## Decision

- **VAPID key exposure:** a runtime endpoint, `GET /api/push/vapid-public-key` (authenticated), returns `{ "data": { "vapid_public_key": "<base64url>" } }`. The key stays single-sourced in the Worker env (`VAPID_PUBLIC_KEY`, validated in `apps/api/src/env.ts`) instead of being duplicated into a `VITE_`-prefixed build-time var that could drift from the private key the API signs with.
- **Create is an idempotent upsert keyed by endpoint.** `POST /api/push-subscriptions` takes the standard `PushSubscription.toJSON()` shape — `{ "endpoint": "<url>", "keys": { "p256dh": "...", "auth": "..." } }`. If the endpoint is new, a row `psub_<nanoid>` is inserted and returned with `201`. If the endpoint already exists (even revoked, even under another user — push endpoints are browser-profile-scoped, so the latest authenticated claimant wins), the row is updated in place: keys refreshed, `user_id` reassigned, `revoked_at` cleared, and the existing record returned with `200`. Both return the full record, so the client always learns the server id.
- **Delete is a soft revoke.** `DELETE /api/push-subscriptions/:id` sets `revoked_at` (the schema kept the column for exactly this) and returns `204`; repeating it is a no-op `204`. A row that doesn't exist or belongs to another user is `404 not_found`. Rows are kept because `notification_deliveries.push_subscription_id` references them and T-008's invalid-endpoint handling revokes the same way; senders must filter `revoked_at IS NULL`.
- **Client id recovery:** the web app caches the returned id in `localStorage`. If the cache is missing while a browser subscription exists (cleared storage, new install of the same profile), the client simply re-POSTs the subscription and the upsert hands back the existing id — no list/lookup endpoint needed for the MVP.

## Consequences

- Enabling notifications is safe to retry from any state and self-heals divergence between browser and server — the worst case is an extra upsert write.
- Revoked rows accumulate instead of disappearing; T-008 delivery queries and any future subscription listing must exclude `revoked_at IS NOT NULL` rows, and a cleanup job can prune old revoked rows later if volume ever matters.
- Reassigning an endpoint's `user_id` on upsert means a shared browser profile ultimately notifies whichever account most recently enabled notifications there — correct for a device that changed hands, and unavoidable anyway since the browser holds one push subscription per origin.
- The API surface in [00. architecture.md](../../specs/mvp/00.%20architecture.md) gains `GET /api/push/vapid-public-key` alongside the two endpoints it already listed.
