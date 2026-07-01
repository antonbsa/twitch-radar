# 0016 - KV-Backed Session Management

## Status

Accepted

## Context

T-002 introduces authenticated routes. The MVP needs a session mechanism that:

- identifies the calling user on every authenticated request,
- supports true server-side logout,
- fits within the Cloudflare Worker runtime (no Node.js session libraries),
- and reuses an already-bound Cloudflare resource.

The main alternatives considered were:

1. **KV-backed session**: a random UUID session ID stored in a `HttpOnly` cookie; the server maps the ID to `{ userId, expiresAt }` in KV.
2. **Stateless JWT**: a signed payload in a cookie; logout requires a short expiry or a KV-based token revocation list (which reintroduces KV anyway).

`APP_CACHE` (KV namespace) is already bound to the Worker for T-001, so option 1 adds no new infrastructure.

## Decision

Store session data in `APP_CACHE` under the key `session:{sessionId}`.

Value shape: `{ userId: string, expiresAt: string }`.

Set `expirationTtl` to 30 days on every `kv.put` so KV auto-expires old sessions without a sweep job.

Transmit the session ID to the browser as a `session` cookie with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.

Logout deletes the KV entry and responds with `Max-Age=0` to clear the cookie.

## Consequences

- Every authenticated request pays one KV read (`getSession`).
- Server-side logout is immediate and authoritative.
- Session storage scales with KV, not with Worker memory.
- Session data is opaque to the client (no JWT payload leakage).
- Rotating `APP_CACHE` or clearing the namespace logs out all users.
