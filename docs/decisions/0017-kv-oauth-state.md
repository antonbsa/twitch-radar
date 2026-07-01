# 0017 - KV Storage for OAuth State Parameter

## Status

Accepted

## Context

The Twitch OAuth flow requires an anti-CSRF `state` parameter: the server generates it before the redirect, and must validate that the callback carries the same value.

Two approaches were considered:

1. **KV entry with TTL**: store `oauth_state:{state}` → `"1"` in `APP_CACHE` for 10 minutes; consume (read + delete) on callback.
2. **Signed cookie**: encode the state in a `HttpOnly` cookie set on the start redirect; validate and clear it on callback; fully stateless.

## Decision

Use `APP_CACHE` (already bound) to store OAuth state for 10 minutes under `oauth_state:{state}`.

On callback, `consumeOAuthState` reads and immediately deletes the entry; if absent, the state is considered invalid.

## Consequences

- Consistent with the session management approach (ADR 0016) — `APP_CACHE` is the single source of short-lived auth state.
- State cannot be replayed after the first callback attempt.
- If the user takes more than 10 minutes to complete the Twitch login, the callback returns 400 and they must restart.
- No extra cookie header is needed on the start redirect.
