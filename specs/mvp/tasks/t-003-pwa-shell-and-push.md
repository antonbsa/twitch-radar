# T-003: PWA Shell And Push

## Goal

Build the mobile-first PWA shell and register browser push subscriptions for authenticated users.

## Spec Work

Define or confirm:

- mobile navigation structure.
- auth/session UI states.
- PWA manifest requirements.
- service worker behavior.
- Push API subscription API contract.
- notification permission UI states.
- invalid/revoked push subscription behavior.

## Implementation Scope

- mobile-first PWA shell.
- login/logout UI.
- connected-account summary.
- followed-channel list view.
- service worker registration.
- PWA manifest and installable metadata.
- notification permission request flow.
- Push API subscription creation with VAPID public key.
- `POST /api/push-subscriptions`.
- `DELETE /api/push-subscriptions/:id`.
- store one or more push subscriptions per authenticated user.
- service worker `push` handler.
- service worker `notificationclick` handler.

## Acceptance Criteria

- Authenticated user can see connected Twitch account state.
- Unauthenticated user can start Twitch login from the UI.
- Followed channels render in a mobile layout.
- Browser can register the service worker.
- PWA manifest is valid enough for installability.
- User can grant notification permission from a user gesture.
- Push subscription is stored in D1 for the authenticated user.
- A user can remove or revoke a stored push subscription.
- Service worker can display a notification from a received push payload.
- Notification click focuses an existing PWA window or opens the app.
- UI handles unsupported Push API or denied notification permission.

## Completion Validation

- PWA shell renders in mobile viewport.
- Service worker registration succeeds in a supported browser.
- Push subscription API integration test passes.
- Service worker push handler is manually verified or covered by a browser-level test.
- iOS installed PWA notification permission and notification display are manually tested before global MVP acceptance.

## Dependencies

- T-001 App Foundation.
- T-002 Twitch Auth And Followed-Channel Sync.
