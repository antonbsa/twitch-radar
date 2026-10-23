# Web Client

How the installed PWA is put together: routing, where server state lives, when it syncs, and what the service worker does. Part of the [architecture overview](overview.md).

## Shape

A React single-page app, served by the same Worker as the API from one origin ([ADR 0020](../decisions/0020-use-react-and-vite-for-web-frontend.md), [ADR 0037](../decisions/0037-single-public-url-same-origin-deployment.md)). It is mobile-first and designed for the installed iOS PWA before desktop browsers. The browser only ever talks to this API, never to Twitch.

Three tabs sit behind a login gate: channels (follows and who is live), alerts (preferences) and account (push, language, pause, sign-out). Signed-out visitors see only the login page, and a signed-in visitor on the login page is sent to the channels tab. The sandbox page exists only in non-production builds.

## Screens And Layout

The visual reference is Twitch's own channel sidebar: compact rows, live channels first, minimal chrome. A persistent bottom tab bar appears on every signed-in route, in the order Channels, Alerts, Account, and opens on Channels. It is not rendered for a signed-out visitor, who sees only the login screen with its single "Connect with Twitch" action.

- **Channels.** Two sections, live above offline. Live channels are ordered by viewer count descending (ties by name) and offline channels by display name ascending. A live row shows a circular avatar with a live indicator, the current category, an abbreviated viewer count (`42K`, `1.2M`) and how long the channel has been in that category, computed from its start time when the row renders; an offline row has no indicator and is dimmer. Each row opens that channel's detail sheet, where its alerts are managed. A Sync button sits in the header.
- **Channel alerts.** Category search is debounced, tapping a result adds a per-channel alert, and the channel's saved alerts show below as removable chips. The sheet closes by swiping down or tapping outside.
- **Alerts.** The global category alerts, one row per category with a remove button, and an add action that opens the same category search in a sheet. With none set, an empty state says so. Alerts for specific channels are grouped by broadcaster in the same order as the Channels tab, with any channel missing from the synced follows last.
- **Account.** The connected Twitch identity, the notification permission state (enabled, not enabled or denied, with a hint to use browser settings when denied), a manual sync, and sign-out, which ends the session and returns to the login page. A reconnect prompt appears only when the session is invalid or the API answers 401 mid-session.

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
