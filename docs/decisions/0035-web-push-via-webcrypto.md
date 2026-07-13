# 0035 - Web Push Sends Hand-Rolled On WebCrypto

## Status

Accepted

## Context

The POC sent Web Push with the `web-push` npm package, which depends on Node's `crypto`/`https` modules that a Cloudflare Worker doesn't provide (the package stays in `apps/api` only for its `generate-vapid-keys` CLI). Sending from the Worker needs RFC 8291 payload encryption (`aes128gcm`) and RFC 8292 VAPID authorization on the platform's WebCrypto, either hand-rolled or via a third-party wrapper.

## Decision

Implement the protocol directly in `services/push/web-push.ts` (~200 lines, zero new dependencies) rather than adopt a wrapper library:

- **VAPID (RFC 8292):** the stored raw key formats (65-byte uncompressed P-256 point, 32-byte scalar, both base64url — what `web-push generate-vapid-keys` emits) are rebuilt into a JWK for WebCrypto ECDSA. Each send signs an ES256 JWT with `aud` = the push endpoint's origin, `exp` = now + 12h, `sub` = `VAPID_SUBJECT`, sent as `Authorization: vapid t=<jwt>, k=<public key>`.
- **Encryption (RFC 8291):** fresh ephemeral ECDH P-256 key pair per message against the subscription's `p256dh` key, HKDF chained through the `auth` secret, one AES-128-GCM record (payloads are far below the 4096 record size), standard `aes128gcm` binary header.
- **Send:** POST with `TTL: 3600` (an hour-old category alert is stale), `Urgency: high`. `sendWebPush` never throws for delivery problems; it returns a result the caller maps to delivery status (ADR 0034).
- **Invalid subscriptions:** 404/410 responses — and subscription keys that fail to import/encrypt — report `endpointGone`, and the sender revokes the `push_subscriptions` row (`revoked_at`, ADR 0027). VAPID key import failures are server-side config errors and never revoke anything.

Tests exercise the real send path against the mock HTTP server (subscription endpoints live on it), with real throwaway keys: the API test tier generates a run-scoped VAPID pair in `global-setup.ts` (the committed `.env.development` placeholders are not a valid P-256 pair) and the test seam fabricates valid `p256dh`/`auth` values when seeding subscriptions. The mock verifies delivery mechanics, not decryption; end-to-end decryptability is covered by the manual device check in T-008's validation.

## Consequences

- No dependency on a low-traffic crypto wrapper; the implementation is auditable in one file and uses only WebCrypto primitives.
- Correctness of the encryption against real push services (FCM, APNs web push, Mozilla autopush) rests on the RFC test vectors having been followed and must be confirmed once manually per major browser.
- `web-push` remains a dependency solely for the `npm run vapid` keygen script.
- If a future feature needs padding, topics, or multi-record payloads, this file grows rather than a library being swapped in.
