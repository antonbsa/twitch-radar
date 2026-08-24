# 0005 - Incremental Follow Sync Not Justified

## Status

Explored, not adopted

## Related

- [Issue #34](https://github.com/antonbsa/twitch-radar/issues/34)
- [TN 0004 - Follow Sync Latency Root Cause](0004-follow-sync-latency-root-cause.md)
- [ADR 0042 - Async Follow Sync Via Queue With KV-Backed Progress Polling](../decisions/0042-async-follow-sync-with-progress-polling.md) (Rejected)
- [apps/api/src/services/twitch/sync.ts](../../apps/api/src/services/twitch/sync.ts)

## Question

Issue #34's third sub-task proposed skipping the full `getAllFollowedChannels` refetch on manual syncs unless the list was stale, always refetching only `getAllFollowedStreams`. With the cooldown (PR #53) and D1-batching (#17/#54) sub-tasks already merged, is this still worth building?

## Findings

- **Not the bottleneck.** TN 0004 measured the two Twitch fetches together at 194ms out of 687ms total backend time for a 105-follow account. They also run in `Promise.all` ([sync.ts:25-38](../../apps/api/src/services/twitch/sync.ts)), so wall-clock cost is `max(channels, streams)`, not the sum — skipping the channels fetch saves at most ~100ms of 687ms.
- **Doesn't skip real work.** `channels` feeds `followedChannels.upsertAll`, `channelState.upsertAll` (needs the full list to mark non-live rows offline), and `ensureMonitoredBroadcasters`. Skipping the fetch just means reading the same list from D1 instead — trading ~190ms of Twitch latency for a D1 read while keeping every downstream write and adding a second code path (staleness branch) to a function shared by the manual route and the `syncStaleFollows` cron.
- **Breaks the button's one job.** The manual "Sync" button's only unique purpose is on-demand freshness for the follow list itself — live/offline state is already kept current server-side via EventSub (ADR 0033) and crons. Gating the follow-list refetch behind a staleness window removes the one thing the button does that background jobs don't already cover.
- **Rate-limit motivation already resolved.** The cooldown (PR #53, 60s per user via KV) caps Helix request volume regardless of click frequency — this was the actual driver behind sub-task #4 in the issue, not fetch cost.

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Build staleness-gated incremental sync as specified | Matches issue's original proposal | Saves ~100ms at best, adds a second sync code path, silently serves a stale follow list from the one control meant to force freshness | Rejected |
| Do nothing, rely on cooldown for rate-limit protection | No added complexity, already shipped, doesn't compromise the button's purpose | None identified for current scale | Adopted |

## Conclusion

Not adopted. The premise (channels fetch as the dominant, avoidable cost) no longer holds after #54's batching/parallelization — see TN 0004. The cooldown already satisfies the issue's underlying rate-limit concern. Building this now would add complexity and quietly weaken the button's only distinct purpose for a sub-100ms saving.

## If we revisit this

If a future account with a much larger follow count (thousands, not ~100) shows the Twitch fetch phase becoming a real, measured contributor to sync latency — most likely via cursor pagination cost, per TN 0004's own revisit trigger — re-measure before building anything speculative.
