# T-002: Twitch Auth And Followed-Channel Sync

## Goal

Allow users to connect Twitch, persist their account, and sync followed channels plus live stream state.

## Spec Work

Define or confirm:

- OAuth route contracts.
- session model.
- OAuth state validation.
- Twitch token storage and encryption approach.
- token refresh behavior.
- followed-channel sync behavior.
- followed-channel API response shape.
- live/offline sorting rules.
- reconnect behavior after token refresh failure.

Decision reference: [ADR 0005](../../../docs/decisions/0005-sync-followed-channels-with-twitch-apis.md).

## Implementation Scope

- `GET /api/auth/twitch/start`
- `GET /api/auth/twitch/callback`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/sync/follows`
- `GET /api/channels/followed`
- Twitch OAuth code exchange.
- Twitch user profile fetch.
- encrypted token persistence.
- token refresh helper.
- followed-channel pagination.
- followed-stream metadata merge into live channel state.
- followed-channel list ordering:
  - live first
  - viewer count descending
  - display name ascending fallback

## Acceptance Criteria

- User can start Twitch login.
- OAuth callback validates `state`.
- OAuth callback exchanges `code` for Twitch tokens.
- User record is created or updated.
- Twitch tokens are stored securely enough for MVP.
- User can log out.
- `GET /api/me` returns authenticated user state.
- Followed channels are synced into D1.
- Live followed channels include viewer count, stream ID, category, and start time when available.
- `GET /api/channels/followed` returns live channels first, live channels ordered by viewer count descending, and offline channels below.
- Expired Twitch access tokens are refreshed before Twitch API calls.
- Failed token refresh marks the user as requiring reconnect or returns a clear auth error.
- Twitch API pagination is handled for followed channels.

## Completion Validation

- OAuth callback flow passes with mocked Twitch responses.
- Follow sync passes with paginated mocked Twitch responses.
- Sorting tests cover live/offline and viewer-count ordering.
- Token refresh tests cover valid refresh and refresh failure.
- Manual login flow works in local or staging environment.

## Dependencies

- T-001 App Foundation.
