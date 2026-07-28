# 0001 - Viewer Count Freshness and Rate-Limit Scalability

## Status

Superseded by [TN 0002](0002-viewer-count-cron-sufficiency-for-twitch-like-freshness.md)

## Related

- [monitored-channels lifecycle (ADR 0030)](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)
- [scheduled ops jobs (ADR 0036)](../decisions/0036-scheduled-ops-jobs.md)
- [apps/api/src/services/twitch/client.ts](../../apps/api/src/services/twitch/client.ts) — `getStreamsByUserIds`
- [apps/api/src/services/eventsub/process.ts](../../apps/api/src/services/eventsub/process.ts) — only current caller of `getStreamsByUserIds` outside seeding

## Question

Two related questions came up while discussing how to keep `viewer_count` fresh in the UI without expensive polling:

1. Is there a Twitch API endpoint that fetches live stream info (including viewer count) in batch, cheaper than one request per channel?
2. Could/should that request be made from the user's browser instead of the server, to reduce load and improve scalability as the registered-user base grows? Is a fixed-interval cron (e.g. every 5 minutes) a scalability risk with many active users?

## Findings

**Batch endpoint already in use.** `GET /helix/streams` (Twitch "Get Streams") accepts up to 100 `user_id` params per request and returns `viewer_count`, `game_id`/`game_name`, `title`, `started_at` for whichever of those are currently live (absent = offline). The project already has this wrapped as [`getStreamsByUserIds`](../../apps/api/src/services/twitch/client.ts:345), batching at 100 per the same D1/Twitch-style constraint pattern used elsewhere in the codebase.

**Current call sites, verified by grep — no periodic refresh exists today.** `getStreamsByUserIds` is called in exactly two places:
- [`services/monitoring.ts`](../../apps/api/src/services/monitoring.ts:84) — fill-only seeding when a broadcaster starts being monitored.
- [`services/eventsub/process.ts`](../../apps/api/src/services/eventsub/process.ts:87), inside `processStreamOnline` — fetched once, at the moment a `stream.online` EventSub event arrives.

There is no cron or route that refreshes `viewer_count` while a stream stays live; it is fetched once at go-live and stays stale (from the app's point of view) until the stream ends. The hypothetical "cron every 5 minutes" that triggered this discussion does not exist in the codebase — it was a forward-looking design question, not a description of current behavior.

**Twitch rate-limit bucket keying (from [Twitch API docs](https://dev.twitch.tv/docs/api/guide/)):** "Your app is given a bucket for app access requests and a bucket for user access requests. For requests that specify a user access token, the limits are applied per client ID per user per minute." Concretely:
- **App access token** (client credentials) → one bucket of 800 pts/min shared by the *entire application*, regardless of registered-user count. This is what the server currently uses (`getAppAccessToken`).
- **User access token** → one bucket of 800 pts/min *per user*, isolated from other users.

**Cost of a hypothetical periodic refresh scales with distinct live monitored broadcasters, not with registered users.** `monitored_channels` ([ADR 0030](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)) is keyed by broadcaster, not by (user, broadcaster) pair — 10,000 users following the same streamer contribute one entry, fetched once per batch. With 100 IDs per request and an 800 pts/min shared app-token bucket, a refresh cycle can cover on the order of tens of thousands of distinct live broadcasters per minute before the shared bucket becomes a real constraint — multiple orders of magnitude past any realistic MVP scale. Growing the number of *registered users* does not move this number; only growing the number of *distinct broadcasters simultaneously live and monitored* does.

**Client-side (browser) fetch was considered and has real costs, not just a rate-limit distribution win.** To call `Get Streams` from the browser, it would need the user's own Twitch OAuth access token client-side. Today no Twitch token ever reaches `apps/web` — auth is session-cookie only, and Twitch tokens are encrypted and stay server-side in `TwitchTokensRepository`. Shipping that token to the browser would:
- Expand XSS blast radius from "session hijack of this app" to "attacker can act as the user against the Twitch API directly."
- Not reduce total requests made to Twitch — it only moves which bucket absorbs the cost (shared app bucket vs. per-user bucket). It is a rate-limit *distribution* change, not a request-count reduction.
- Lose the cross-user broadcaster deduplication the server gets for free today (each browser tab would fetch independently for whatever channels that user follows, instead of one batched request covering all users watching the same broadcaster).

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Fixed-interval server cron (e.g. every 5 min) refreshing all live monitored broadcasters | Simple, centralized, predictable freshness | Runs even when nobody is looking; shares the single app-token bucket (though headroom is large at MVP scale per Findings) | Not needed yet — no product requirement pulls for constant background freshness |
| On-demand/lazy server refresh when a user opens or focuses the Channels tab, with a short TTL cache (e.g. 30-60s in KV) to dedupe concurrent opens | Cost scales with concurrently-active users, not registered users or a fixed schedule; keeps token custody server-side; still batches via `getStreamsByUserIds` | Slightly more moving parts than a flat cron (cache key/TTL, cache invalidation on tab focus) | Preferred direction if/when live freshness becomes a real product requirement |
| Client-side fetch using the user's own Twitch access token | Isolates rate-limit bucket per user, sidesteps shared app-token bucket entirely | Requires exposing raw Twitch OAuth tokens to the browser (architecture change, real security regression); does not reduce total Twitch request volume; loses cross-user broadcaster dedup; contradicts current server-custody-of-tokens design | Rejected for now |

## Conclusion

No code or spec change resulted from this discussion. Viewer-count freshness beyond "set once at `stream.online`, held until offline" is not a current product requirement, and the scalability worry that prompted the discussion (a fixed-interval cron becoming expensive as registered users grow) does not hold up: the relevant Twitch rate-limit bucket for the server's current app-token approach scales with *distinct live monitored broadcasters* (already deduplicated via `monitored_channels`), not with registered- or active-user count, and has orders-of-magnitude of headroom at MVP scale. Moving the fetch to the client was evaluated and rejected — it would trade a token-custody security regression for a rate-limit *distribution* change that isn't solving an actual bottleneck.

## If we revisit this

Revisit if a product requirement emerges for `viewer_count` to update while a stream stays live (today it's static after `stream.online`). If so, the on-demand/lazy-refresh-on-tab-focus route (see Options) is the one worth designing first — it keeps token custody server-side and scales with active usage rather than registered-user count. Only reconsider a fixed cron if that on-demand approach proves insufficient. Only reconsider client-side/user-token fetching if a concrete case emerges where the *shared app-token bucket itself* is empirically the bottleneck (not just a theoretical worry) — the math in Findings suggests that would require a very large number of distinct, simultaneously-live monitored broadcasters, far beyond MVP scale.
