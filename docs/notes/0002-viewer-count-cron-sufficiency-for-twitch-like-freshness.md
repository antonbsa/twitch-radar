# 0002 - Viewer Count Cron Sufficiency for Twitch-Like Freshness

## Status

Deferred

## Related

- [0001 - Viewer Count Freshness and Rate-Limit Scalability](0001-viewer-count-freshness-and-rate-limit-scalability.md) — superseded by this note's conclusion
- [ADR 0030 - monitored-broadcaster lifecycle](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)
- [ADR 0036 - scheduled ops jobs](../decisions/0036-scheduled-ops-jobs.md)
- [apps/api/src/services/twitch/client.ts](../../apps/api/src/services/twitch/client.ts) — `getStreamsByUserIds`
- [apps/api/src/crons.ts](../../apps/api/src/crons.ts)

## Question

TN 0001 concluded that no fixed-interval refresh of `viewer_count` was needed because no product requirement pulled for it. This follow-up starts from an explicit product goal instead: `viewer_count` should feel as fresh as it does in Twitch's own UI. Two questions follow:

1. Does Twitch document how frequently `viewer_count` itself is refreshed on their end (i.e., is there a ceiling on how fresh polling could ever make our data, no matter how often we ask)?
2. Given that ceiling (or lack of one), is a fixed 5-minute server cron on `getStreamsByUserIds` sufficient to deliver a Twitch-like experience, without reopening the rate-limit/scalability concerns TN 0001 already investigated?

## Findings

**Twitch does not document a refresh interval for `viewer_count`.** Checked the [Get Streams API reference](https://dev.twitch.tv/docs/api/reference/#get-streams) directly for any mention of real-time behavior, refresh interval, caching, or staleness on the `viewer_count` field — none exists. The field is documented only by type (`integer`), with no SLA on how current it is server-side. Community-observed behavior (not an official guarantee) suggests granularity on the order of ~1-2 minutes, but this is not something the API contract promises and could change without notice.

**Practical consequence: our polling interval only needs to be same-order-of-magnitude as Twitch's own refresh, not faster.** Since Twitch itself does not deliver sub-minute accuracy (informally observed), polling more aggressively than every ~1-2 min cannot produce a "fresher" number than Twitch already has — it would just spend more of the shared rate-limit budget for no perceptible gain. A 5-minute cadence is within the same order of magnitude as the observed ceiling and would not read as meaningfully staler to a user than Twitch's own live viewer count display.

**Manual verification recipe** (for spot-checking actual freshness/behavior against a real channel, using an app access token via client-credentials grant — same mechanism as [`fetchAppAccessToken`](../../apps/api/src/services/twitch/client.ts)):

```bash
# 1. Get an app access token
curl -s -X POST "https://id.twitch.tv/oauth2/token" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "grant_type=client_credentials"

# 2. Query a specific channel's live data
curl -s "https://api.twitch.tv/helix/streams?user_login=STREAMER_LOGIN" \
  -H "Client-Id: CLIENT_ID" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

**Rate-limit math from TN 0001 still holds and was not re-litigated.** The app-access-token bucket (800 pts/min, shared app-wide, per [Twitch's rate-limit docs](https://dev.twitch.tv/docs/api/guide/)) scales with *distinct live monitored broadcasters* via `monitored_channels` dedup ([ADR 0030](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)), batched 100 per request in `getStreamsByUserIds` — not with registered- or active-user count. A 5-minute cron comfortably fits this headroom at current/foreseeable MVP scale; nothing in this note changes that conclusion.

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Fixed 5-min server cron refreshing `viewer_count` for currently-monitored live broadcasters | Matches Twitch's own (undocumented, ~1-2 min observed) refresh ceiling closely enough to feel equivalent; simple, centralized; rate-limit headroom already confirmed in TN 0001 | Runs even when nobody is looking at the data; still shares the single app-token bucket (though headroom is large) | **Adequate for the "Twitch-like freshness" goal** — the option TN 0001 deferred is now validated as sufficient, if this becomes a real feature |
| On-demand/lazy refresh on tab focus, short TTL cache | Cost scales with active viewers, not a fixed schedule | More moving parts (cache key/TTL, invalidation); doesn't beat 5-min cron on simplicity if freshness ceiling is already Twitch-side, not us-side | Still viable, but no longer clearly better once the freshness ceiling is understood to be on Twitch's side, not ours |
| Client-side fetch with user's own Twitch token | (see TN 0001) | (see TN 0001 — token custody regression, no total-request reduction) | Rejected, same reasoning as TN 0001 |

## Conclusion

A fixed 5-minute server cron on `getStreamsByUserIds`, scoped to currently-monitored live broadcasters, would be sufficient to approximate a Twitch-like live-viewer-count experience. This is because Twitch itself does not document — and is informally observed not to deliver — materially better than ~1-2 minute granularity on `viewer_count`; polling faster than that ceiling cannot make the data feel fresher, only spend more rate-limit budget. This supersedes TN 0001's framing (which deferred any fixed-interval refresh for lack of a product requirement): with the requirement now explicit (match Twitch's own freshness), the fixed-cron option evaluated there is validated rather than deferred.

No code or spec change resulted from this discussion. If the product decides to build this, it needs a task/spec entry and an ADR (mirroring the pattern in [ADR 0036](../decisions/0036-scheduled-ops-jobs.md)) referencing this note.

## If we revisit this

Revisit when there is an actual task to implement periodic `viewer_count` refresh. At that point, write an ADR that references this note and TN 0001, specifying: cron cadence (5 min, per this note), scope (which broadcasters — likely only those currently live, mirroring the `stream.online` seeding already in [`process.ts`](../../apps/api/src/services/eventsub/process.ts)), and confirming the rate-limit headroom assumption still holds at whatever broadcaster count exists at implementation time.
