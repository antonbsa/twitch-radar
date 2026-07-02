# T-005: PWA Shell And Push

## Goal

Register the PWA service worker, handle browser push subscriptions for authenticated users, and complete the notification permission flow in the Account view.

## POC Reference

The original Web Push POC (`src/push.ts`, `src/server.ts`) proved browser Push API + VAPID mechanics before this task existed. Its architecture (Fastify routing, local JSON storage) is superseded and was removed from the repo, but the Push API/service worker logic is still available for reference at commit `e8417e9` ("feat: initialize PWA notification POC") — see [ADR 0010](../../../docs/decisions/0010-keep-poc-separate-from-mvp-architecture.md).

## Spec Work

Define or confirm:

- PWA manifest requirements.
- service worker registration strategy within Vite build (vite-plugin-pwa vs. manual entry point).
- Push API subscription flow: VAPID key exposure, subscription creation, error handling.
- push subscription API contract.
- notification permission UI states and Account view integration (stub defined in T-004).
- invalid/revoked push subscription behavior.
- service worker scope and caching strategy (if any).

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
