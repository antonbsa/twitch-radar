# Web Client

How the installed PWA is put together: routing, where server state lives, when it syncs, and what the service worker does. Part of the [architecture overview](overview.md).

## Shape

A React single-page app, served by the same Worker as the API from one origin ([ADR 0020](../decisions/0020-use-react-and-vite-for-web-frontend.md), [ADR 0037](../decisions/0037-single-public-url-same-origin-deployment.md)). It is mobile-first and designed for the installed iOS PWA before desktop browsers. The browser only ever talks to this API, never to Twitch.

Three tabs sit behind a login gate: channels (follows and who is live), alerts (preferences) and account (push, language, pause, sign-out). Signed-out visitors see only the login page, and a signed-in visitor on the login page is sent to the channels tab. The sandbox page exists only in non-production builds.

## Server State

The server owns all data; the client keeps a cache of it ([ADR 0023](../decisions/0023-use-tanstack-query-for-server-state.md)). Reads are queries, writes are mutations that update or invalidate the cached query they affect. Retries cover network errors and 5xx only: a 4xx won't succeed on a second try, so it surfaces at once.

The current user is loaded once and held in an auth context. A dead Twitch grant shows up there as the reconnect state, and writes go through a wrapper that flips it when the API reports one, so the app asks the person to sign in again instead of failing silently ([auth](auth.md)). Language is guessed locally before the user is known and replaced by the account's stored preference once it arrives ([ADR 0044](../decisions/0044-i18n-key-based-catalog-and-language-preference.md)).

## Keeping The List Fresh

The channels list is a snapshot, not a live feed: nothing polls. It refreshes when the app loads and when it returns to the foreground, but only if the last follow sync is more than 30 minutes old, plus on the Sync button ([follow sync](follow-sync.md)). The background refresh is silent; only a user-triggered one toasts on failure. A sync result replaces the cached list directly, and cancels any read still in flight so a stale response can't overwrite it.

Live changes reach a person through push, not through the page: the page is expected to be closed.

## Service Worker

Hand-written, with no build plugin and no offline caching ([ADR 0026](../decisions/0026-manual-service-worker-without-vite-plugin-pwa.md)). It does two things:

- **On a push**, it renders the notification from message keys and the recipient's language, fetching the same catalog the app uses, and shows Watch and Snooze actions ([notification delivery](notification-delivery.md)).
- **On a click**, Watch opens the stream, Snooze calls the API without opening the app, and anything else focuses an open app window or opens one at the target.

Because the iOS PWA reports little about notifications after the fact, the worker remembers the click target itself instead of trusting the notification's data, and does not try to merge or replace earlier notifications ([ADR 0055](../decisions/0055-client-side-notification-digest.md), [TN 0007](../notes/0007-client-side-notification-digest-not-viable-on-ios.md)).

## Errors

Browser errors are reported to a separate Sentry project from the Worker's; the service worker is not instrumented ([observability](observability.md)).
