# 0004 - Follow Sync Latency Root Cause

## Status

Informational

## Related

- [Issue #54](https://github.com/antonbsa/twitch-radar/issues/54)
- [ADR 0042 - Async Follow Sync Via Queue With KV-Backed Progress Polling](../decisions/0042-async-follow-sync-with-progress-polling.md) (Rejected as a result of this investigation)
- [apps/api/src/services/twitch/sync.ts](../../apps/api/src/services/twitch/sync.ts)
- [apps/api/src/services/monitoring.ts](../../apps/api/src/services/monitoring.ts)
- [apps/api/src/db/repositories/followed-channels.ts](../../apps/api/src/db/repositories/followed-channels.ts)

## Question

`POST /api/sync/follows` measured at ~31s in production, ~22s in preview, ~5s local. Issue #54 batched the D1 writes (one `db.batch()` call per repository instead of one awaited query per row) and parallelized independent awaits across the sync path. After implementing it, a manual preview test showed almost no improvement (~22s → ~20s). What is actually consuming the remaining ~20s, and was the D1-round-trip hypothesis that motivated #54 correct?

## Findings

**The improvement measurement was invalid — it never exercised the changed code.** Testing against `wrangler dev --env preview --remote` requires logging in via Twitch OAuth. `env.preview`'s `PUBLIC_URL` in `wrangler.jsonc` is hardcoded to the already-published `https://twitch-radar-preview.antonbsa.workers.dev`, and both the OAuth `redirect_uri` and the post-login redirect (`apps/api/src/http/routes/auth.ts`) are derived from it. After logging in, the browser was redirected to that published origin — not back to the local `wrangler dev --remote` instance running the worktree's code. Every subsequent "Sync" click in that session hit the old, unbatched, pre-#54 Worker, regardless of what was changed locally. The ~22s → ~20s delta was measurement noise on the same unchanged deployed code, not a real result.

**Fix for local testing against `--remote`:** override the var at the CLI without touching the committed config: `npx wrangler dev --env preview --remote --var PUBLIC_URL:http://localhost:8787`, plus registering `http://localhost:8787/api/auth/twitch/callback` as an additional redirect URI on the Twitch app (multiple redirect URIs per client are allowed, and preview/production already each register their own).

**Once actually testing the changed code, phase-level timing (`timed()` helper added to `apps/api/src/logger.ts`, instrumenting `sync.ts`, `monitoring.ts`, `client.ts`, `routes/sync.ts`) showed the real number for a 105-follow account, 1 active global preference, run against real preview D1/KV over `--remote`:**

| Phase | ms |
| --- | --- |
| `request.getValidAccessToken` | 37 |
| `sync.twitchFetch` (followed channels + followed streams, parallel) | 194 |
| `sync.persist` (followedChannels + channelState, parallel) | 117 |
| `sync.listGlobalPreferences` | 89 |
| `sync.ensureMonitored` (monitoredChannels + eventsubSubscriptions.ensurePending + seedMissingChannelState, parallel) | 142 |
| `sync.updateLastFollowSyncAt` | 72 |
| **`sync.total`** | **614** |
| **`request.syncFollows.total`** | **687** |

`monitoring.seed.missingCount` logged `requested: 105, missing: 0` — confirming `seedMissingChannelState` does no redundant Twitch work, since `sync.persist.channelState` already seeded every row before `ensureMonitored` runs. `sync.ensureMonitored`'s 142ms matches its slowest child (`ensurePendingSubscriptions`), confirming the `Promise.all` in `ensureMonitoredBroadcasters` runs concurrently rather than sequentially.

Backend total: **687ms**, covering both Twitch fetches, the D1 upserts, and the full monitoring fan-out (315 EventSub subscription rows for 105 broadcasters × 3 event types). The gap between this and what was observed in the browser (~1.4s) is the `--remote` dev-mode hairpin (browser → local wrangler proxy → Cloudflare tunnel → edge → back) — a dev-tooling artifact, not present when a request hits a deployed Worker directly.

**The original D1-round-trip hypothesis was directionally right but not the dominant cost.** Before #54, `followedChannels.upsertAll` alone issued ~105 sequential awaited `.run()` calls; across all four repositories touched by a full sync, roughly ~193 sequential D1 round trips collapsed to ~8 batched ones. Back-of-envelope from the invalid 22s→20s reading (~2s saved for ~185 round trips eliminated) suggested ~11ms/round-trip — an order of magnitude below what turned out to be true, since that reading was noise, not signal. The real, validly-measured before/after is unknown for the exact same account, but the current 687ms backend time for a 105-follow account with monitoring fully exercised is consistent with #54's batching plus parallelization being sufficient on its own — no separate bottleneck (e.g. Twitch cursor pagination, duplicated token refresh) is visible in the phase breakdown above; the largest single contributor is `sync.twitchFetch` at 194ms across only 2 Twitch pages.

**A second, unrelated bug was found and fixed during this investigation:** `wrangler dev`'s inspector-based console relay (both local and `--remote`) does not forward `console.debug()` calls to the terminal, only `console.log`/`info`/`warn`/`error`. `apps/api/src/logger.ts`'s `debug()` method used `console.debug` internally, which made the `debug`-level phase-timing logs silently invisible in the terminal even though `ENVIRONMENT=preview` correctly set the minimum log level to `debug`. Fixed by switching the underlying console method to `console.log` while keeping the `debug` level-filtering logic (and its production exclusion) unchanged — this fix is kept in the codebase independent of the instrumentation below.

## Profiling approach (for future reuse)

The phase-level timing used for the table above was ad hoc instrumentation added for this investigation and removed afterward — it doesn't earn its keep as permanent code (added meaningfully to how many places in the sync path read, only valid for this one diagnostic), but the approach worked well enough to be worth reproducing verbatim if a similar slow-path investigation comes up again, rather than re-deriving it. It was a single helper in `apps/api/src/logger.ts`:

```ts
async function timed<T>(
  phase: string,
  fn: () => Promise<T>,
  describe?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now()
  const result = await fn()
  logger.debug("phase timing", {
    phase,
    ms: Date.now() - startedAt,
    ...describe?.(result),
  })
  return result
}
```

Used by wrapping the specific async step under investigation:

```ts
const channels = await timed(
  "sync.twitchFetch.followedChannels",
  () => getAllFollowedChannels(clientId, accessToken, twitchUserId, apiBaseUrl),
  (r) => ({ channels: r.length }),
)
```

Key properties that made it useful:

- `phase` is a free-form dotted string, not tied to a function/method name, so nested measurements (e.g. `sync.twitchFetch` wrapping two child `timed()` calls run inside the same `Promise.all`) read as a hierarchy in the log stream.
- `describe` attaches scale metadata (row counts, page numbers) to the duration — without it, a slow duration and a duration covering many fast iterations are indistinguishable.
- It logs at `debug`, which this codebase already filters out of production (`apps/api/src/logger.ts`'s `ENVIRONMENT_MIN_LEVEL`), so it was safe to leave temporarily wired through several files without a production cost, as long as it's removed before merging rather than left as permanent surface area.

A class-based `@timed` decorator was considered as a way to reduce call-site boilerplate and rejected: most of the call sites here are plain exported functions in module files (`sync.ts`, `monitoring.ts`, `client.ts`), not class methods, so adopting decorators would have meant restructuring those modules into classes just to get the syntax — a much larger and unrelated change. It would also have lost the free-form nested phase naming and per-call `describe` callback, both of which were exercised above.

## Options considered

Not applicable — this was root-cause investigation, not a design decision with alternatives to weigh.

## Conclusion

The ~20-31s latency reported for `POST /api/sync/follows` was real, but the "no improvement after #54" observation was an artifact of a `PUBLIC_URL`/OAuth-redirect bug in local `--remote` testing that caused every manual test to hit the old, unbatched, published preview Worker instead of the code under test. Once corrected, a real 105-follow account with an active global preference completes the entire sync (both Twitch fetches, all D1 writes, and the full EventSub monitoring fan-out) in ~700ms backend time. Issue #54's batching and parallelization changes are sufficient by themselves; no further architectural change (async queue + progress polling, incremental sync, etc.) is currently justified by measured data. [ADR 0042](../decisions/0042-async-follow-sync-with-progress-polling.md) was marked Rejected as a direct result.

## If we revisit this

If a future account with a much larger follow count (thousands, not ~100) shows real multi-second latency, re-add phase-level timing along the lines described above (temporarily, removed again once the investigation concludes) rather than reintroducing async/polling design work speculatively. Twitch's cursor pagination (`getAllFollowedChannels`/`getAllFollowedStreams`, page size 100) is the most likely place latency would reappear at that scale, since it's the one part of the sync that is inherently sequential and was not exercised beyond 2 pages in this measurement.
