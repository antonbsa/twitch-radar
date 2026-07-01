# T-000: Global MVP Acceptance

## Goal

Validate the full MVP as one connected system: Twitch account sync, category preferences, EventSub processing, state comparison, and Web Push delivery to the PWA.

## Scope

This is not an implementation task. It is the final acceptance checklist that validates all MVP task work together.

Decision references are listed in [../../../docs/decisions](../../../docs/decisions).

## Acceptance Criteria

- User can connect a Twitch account through OAuth.
- User session persists across reloads until logout or expiry.
- Followed Twitch channels are synced through Twitch APIs.
- Followed channel list renders with live channels first, live channels ordered by viewer count descending, and offline channels below.
- User can create and remove a per-channel category preference.
- User can create and remove a global category preference.
- Monitored broadcasters have EventSub webhook subscriptions for `stream.online`, `stream.offline`, and `channel.update`.
- Twitch webhook challenge requests are handled.
- Twitch webhook signatures are verified.
- Valid Twitch webhooks are enqueued for async processing.
- Event processing updates `channel_state`.
- Relevant transitions are stored in `channel_state_changes`.
- `stream.online` in a desired category sends a push notification.
- `channel.update` switching into a desired category while live sends a push notification.
- Offline category changes do not send notifications.
- Stream offline events do not send category notifications.
- Duplicate EventSub messages do not produce duplicate notifications.
- Per-channel and global matches for the same event follow the accepted notification dedupe ADR.
- PWA service worker receives push payloads and displays notifications.
- Notification click opens or focuses the PWA.
- Invalid push subscriptions are marked revoked or disabled.
- EventSub reconciliation can detect and recreate missing active subscriptions.
- Twitch token refresh works for expired access tokens.
- Token refresh failure surfaces a reconnect state.

## Completion Validation

- All task-level acceptance criteria for T-001 through T-008 are complete.
- Automated tests cover critical domain logic and API behavior.
- Manual iOS PWA push notification test passes on an installed Home Screen app.
- A documented end-to-end test path exists for a mocked or real Twitch `stream.online` event and a mocked or real `channel.update` event.
- The architecture document matches the implemented behavior or explicitly documents accepted deviations.

## Required Evidence

- Passing test command output.
- Successful D1 migration output.
- Local or deployed Worker URL.
- Example followed-channel sync result.
- Example preference record.
- Example EventSub webhook processing log or test fixture.
- Example notification delivery record.
- Manual iOS push test result.
