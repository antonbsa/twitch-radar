# T-005: PWA Shell And Push

## Goal

Register the PWA service worker, handle browser push subscriptions for authenticated users, and complete the notification permission flow in the Account view.

## POC Reference

The original Web Push POC (`src/push.ts`, `src/server.ts`) proved browser Push API + VAPID mechanics before this task existed. Its architecture (Fastify routing, local JSON storage) is superseded and was removed from the repo, but the Push API/service worker logic is still available for reference at commit `e8417e9` ("feat: initialize PWA notification POC") — see [ADR 0010](../../../docs/decisions/0010-keep-poc-separate-from-mvp-architecture.md).

## Spec Work

Resolved decisions:

- **Service worker strategy:** hand-written `apps/web/public/service-worker.js` registered from `src/main.tsx`; no `vite-plugin-pwa`. Root scope, `push` + `notificationclick` handlers only, **no `fetch` handler and no caching** (network-only app). See [ADR 0026](../../../docs/decisions/0026-manual-service-worker-without-vite-plugin-pwa.md).
- **PWA manifest:** static `apps/web/public/manifest.webmanifest` linked from `index.html` (`name`, `short_name`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, dark theme colors, SVG icon with `sizes: "any"`). PNG icons (192/512 + 180px `apple-touch-icon`) are an asset follow-up to produce before the iOS manual validation pass — no local image tooling in the repo.
- **VAPID key exposure:** `GET /api/push/vapid-public-key` (authenticated) returns `{ "data": { "vapid_public_key": "..." } }`; the key stays single-sourced in the Worker env. See [ADR 0027](../../../docs/decisions/0027-push-subscription-lifecycle-and-api-contract.md).
- **Push subscription API contract** ([ADR 0027](../../../docs/decisions/0027-push-subscription-lifecycle-and-api-contract.md)):
  - `POST /api/push-subscriptions` with the `PushSubscription.toJSON()` shape `{ "endpoint": "<url>", "keys": { "p256dh": "...", "auth": "..." } }` — idempotent upsert keyed by endpoint (refreshes keys, reassigns user, clears `revoked_at`); `201` on create, `200` on reuse, both returning the full record. Malformed body → `400 invalid_request`.
  - `DELETE /api/push-subscriptions/:id` — soft revoke (`revoked_at`), `204`, idempotent; `404 not_found` for unknown or other-user ids.
- **Client subscription flow:** Enable button → `Notification.requestPermission()` → `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → POST → cache returned id in `localStorage`. A browser subscription with no cached id is re-POSTed to recover the id (upsert). Disable → `subscription.unsubscribe()` + `DELETE`.
- **Notification permission UI states (Account view):** status derives from permission **and** device subscription: unsupported (`serviceWorker`/`PushManager`/`Notification` missing) → "Not supported"; `denied` → "Denied" + browser-settings note; `default` or `granted` without an active device subscription → "Not enabled" + "Enable Notifications" button; `granted` with an active subscription → "Enabled" + "Disable on this device" button. Enable failures (permission not granted, subscribe/API error) surface as an inline error message and return to the actionable state.
- **Invalid/revoked subscription behavior:** rows are soft-revoked, never hard-deleted (`notification_deliveries` references them; T-008 revokes invalid endpoints the same way). Delivery-time filtering of `revoked_at IS NOT NULL` is T-008 scope.

## Implementation Scope

- service worker registration from the React app (via Vite build integration or manual).
- PWA manifest and installable metadata.
- Notification permission request flow wired into the Account view "Enable Notifications" button (stub from T-004).
- Push API subscription creation with VAPID public key.
- `POST /api/push-subscriptions`.
- `DELETE /api/push-subscriptions/:id`.
- store one or more push subscriptions per authenticated user.
- service worker `push` handler.
- service worker `notificationclick` handler: focus existing PWA window or open app.
- UI handles unsupported Push API or denied notification permission (extends Account view stub from T-004).

## Acceptance Criteria

- Browser can register the service worker.
- PWA manifest is valid enough for installability.
- User can grant notification permission from the "Enable Notifications" button in the Account view.
- Push subscription is created and stored in D1 for the authenticated user.
- A user can remove or revoke a stored push subscription.
- Service worker can display a notification from a received push payload.
- Notification click focuses an existing PWA window or opens the app.
- Denied notification permission state is communicated correctly in the Account view.
- UI handles unsupported Push API gracefully.

## Completion Validation

- Service worker registration succeeds in a supported browser.
- Push subscription API integration test passes.
- Service worker push handler is manually verified or covered by a browser-level test.
- iOS installed PWA notification permission and notification display are manually tested before global MVP acceptance.

## Dependencies

- T-001 App Foundation.
- T-002 Twitch Auth And Sync.
- T-003 Frontend Scaffold.
- T-004 UI Views.
