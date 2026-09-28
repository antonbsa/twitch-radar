# 0049 - EventSub Subscription Failure Backoff, Terminal Status, And Callback Validation

## Status

Accepted

## Context

Issue #73: starting 2026-09-02, preview repeatedly logged `EventSub subscription create failed` for the same rows, unresolved for over a week. The root cause was `pending` rows seeded with a local-dev `callback_url` (most likely from a `wrangler dev --env preview --remote` run against active local env files), which Twitch permanently rejects (`"callback must provide valid https callback with standard port"`). Nothing distinguishes a permanent failure from a transient one: `createPendingEventsubSubscriptions` (ADR 0031) retries every `pending` row every minute forever, and `reconcileEventsubSubscriptions` (ADR 0036) explicitly skips any `status === "pending"` row, so a permanently-broken row consumes the per-run budget indefinitely with no escape hatch and no distinct signal that it's stuck. Open questions were how a row backs off and eventually gives up, how (or whether) a given-up row ever gets another chance, and how a bad callback URL is caught before it's even persisted.

## Decision

- **Per-row exponential backoff.** Two new columns on `eventsub_subscriptions`: `failure_count` (integer, default 0) and `next_retry_at` (nullable text/ISO timestamp). `findPending` only returns rows whose `next_retry_at` is null or has passed. Each failed create increments `failure_count` and sets `next_retry_at` to `now + min(60s * 2^(failure_count-1), 3600s)` — 1min, 2min, 4min, 8min, ... capped at 1h. A successful create clears both fields back to zero/null.
- **Terminal `failed` status after 5 consecutive failures.** On the 5th consecutive failure the row's status flips to `failed` instead of scheduling another retry; `findPending` only ever selects `status = "pending"`, so a `failed` row stops consuming the per-run budget entirely instead of only after enough time has passed to hit the backoff cap.
- **`reconcileEventsubSubscriptions` resurrects `failed` rows after a 24h cooldown.** For a still-active broadcaster, a `failed` row whose `updated_at` is more than 24h old is reset to `pending` (`failure_count`/`next_retry_at` cleared) via the same `resetToPending` repair path already used for drift/missing-subscription rows. The cooldown is deliberately long: this exists to recover a row once its underlying cause is actually fixed (a corrected `PUBLIC_URL`, a re-registered redirect URI), not to retry the same permanent failure sooner.
- **The EventSub callback URL is validated where it's derived, not just at the Twitch API boundary.** `eventsubCallbackUrl()` (`services/monitoring.ts`) throws if the constructed URL isn't `https` with a standard port (443, or none specified), unless `environment === "local"`. This is defense-in-depth alongside — not a replacement for — not running local dev against a shared remote environment in the first place: it catches a bad `PUBLIC_URL` at the one place every caller (staging a pending row, reconciliation) derives this URL, so a misconfigured environment fails loudly instead of silently producing a `pending` row that can never succeed.

The specific numbers (1min initial backoff doubling to a 1h cap, 5 consecutive failures before terminal, 24h cooldown) are accepted as reasonable defaults for MVP scale, not derived from measurement — revisit if either creation volume or false-terminal rate becomes a real problem.

## Consequences

- A row stuck on a permanent failure (bad config, revoked credentials) is visible as a distinct `failed` status within roughly 15 minutes (1+2+4+8min) instead of silently retrying every minute forever, and self-heals within 24h of the actual cause being fixed without needing a manual DB repair.
- `findPending`'s query is now a status equality plus an OR over a nullable column — still a single indexed-enough scan at MVP row counts, but worth watching if the table grows large enough for `next_retry_at` to want its own index.
- The callback URL validation only ever fires outside `environment === "local"`, so nothing in local dev's http/non-standard-port setup is affected; it's the same guard whether the bad `PUBLIC_URL` reaches `ensureMonitoredBroadcasters` (staging a new row) or `reconcileEventsubSubscriptions` (re-deriving the ownership marker each run).
- This does not prevent the `wrangler dev --env <preview|production> --remote` + local-env-file scenario that produced the original bad rows — that hazard is a separate, non-decision documentation fix (see `docs/deployment.md` and the root `CLAUDE.md`'s Env Vars section).
