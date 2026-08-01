# 0042 - Async Follow Sync Via Queue With KV-Backed Progress Polling

## Status

Proposed

## Context

Issue #34 tracks three symptoms of the same code path (`POST /api/sync/follows` → `handleSyncFollows` → `syncFollowedChannels` in `apps/api/src/services/twitch/sync.ts`): slow first sync, slow repeat syncs, and no progress feedback. Its sub-tasks split the fix into independently shippable pieces — a cooldown/rate-limit, the (already-closed, issue #17) D1 batching fix, an incremental-sync optimization (skip the expensive full followed-channels refetch on manual syncs unless stale), and progress feedback. This ADR covers only the last one, per the issue's own note that it "is a real design decision, not a small tweak, and should go through this project's ADR process before implementation." The other sub-tasks are out of scope here and this design must not assume any of them are already built.

Today `handleSyncFollows` awaits the entire sync — Twitch follow/stream pagination, D1 upserts, and monitored-broadcaster maintenance — inside one HTTP request/response cycle, and returns only `{ ok: true }` on completion. `useSyncFollows()` (`apps/web/src/hooks/use-channels.ts`) exposes just `isPending`; the "Sync" button (`apps/web/src/routes/channels.tsx`) shows an indefinite spinner for however long that round trip takes.

Making the endpoint non-blocking requires deciding: how the response returns before the sync finishes, where the in-progress state lives given Workers have no persistent in-memory state between requests, what "progress" means concretely, and how this interacts with the existing `syncStaleFollows` cron (ADR 0036) and the not-yet-built incremental-sync sub-task.

The codebase already has two examples of background execution to draw on: Cloudflare Queues (`TWITCH_EVENTS_QUEUE`, `NOTIFICATION_JOBS_QUEUE` — ADR 0031, ADR 0034) for decoupling a request/webhook from the work it triggers, and the `scheduled()` cron dispatch (ADR 0036) for periodic background jobs including `syncStaleFollows` itself. It also already uses `KV_APP_CACHE` for short-lived, self-expiring, per-key server state (sessions — ADR 0016; OAuth state — ADR 0017).

## Decision

**1. The endpoint becomes a start-and-poll pair, using a new queue for the background work.**

`POST /api/sync/follows` no longer awaits `syncFollowedChannels`. Instead it:

- generates a `syncId` (`crypto.randomUUID()`),
- writes an initial progress record to `KV_APP_CACHE` under `sync_progress:{userId}` (see below),
- enqueues a single message `{ syncId, userId, twitchUserId }` onto a new `SYNC_JOBS_QUEUE` (backed by a new `twitch-radar-sync-jobs` queue, mirroring the existing per-job-own-queue pattern from ADR 0031/0034/0036 — its own producer/consumer binding per environment in `wrangler.jsonc`, same as `TWITCH_EVENTS_QUEUE`/`NOTIFICATION_JOBS_QUEUE`),
- and responds `202 { syncId, status: "queued" }` immediately.

A new consumer (`services/twitch/sync-jobs-consumer.ts`, wired in `index.ts` next to the existing two consumers) reads the message, resolves a fresh access token, and calls `syncFollowedChannels` with an added optional `onProgress` callback that the consumer wires to KV writes (see below). On success it writes a terminal `"done"` progress record; on a thrown error it catches, writes `"failed"` with the error message, and rethrows so the queue's existing retry-on-throw behavior still applies to infrastructure failures (consistent with how `processTwitchEventMessage`/notification delivery already rely on queue retries, ADR 0032/0034).

A queue was chosen over `ctx.executionCtx.waitUntil()` for three reasons:

- This codebase already has an established mechanism for "the response returns, the work keeps going elsewhere": queues. Introducing `waitUntil` would be a second, different background-execution mechanism alongside the first, for no functional gain.
- `waitUntil` ties the sync's runtime to the original request invocation's own CPU/wall-clock budget. A queue consumer runs as its own invocation, decoupled from the request that triggered it, matching how heavy work already happens in this Worker (webhook processing, notification sends).
- A queue gets automatic retry-on-throw for free (already relied on elsewhere per ADR 0032/0034); a `waitUntil` promise that throws just disappears unless the handler wraps it in bespoke try/catch/log — reinventing what the queue already provides.

**2. Progress lives in KV, one active-sync slot per user.**

Key: `sync_progress:{userId}` in `KV_APP_CACHE`, `expirationTtl` ~10 minutes (auto-expiry, same pattern as session/OAuth-state — no separate cleanup job needed for abandoned/stuck entries). Value shape:

```ts
{
  syncId: string
  status: "queued" | "running" | "done" | "failed"
  phase: "fetching_channels" | "fetching_streams" | "persisting" | "monitoring" | "done"
  processed: number
  total: number | null
  error?: string
  startedAt: string
  updatedAt: string
}
```

KV, not D1: this state is ephemeral, high-churn only for the seconds a sync runs, and useless once the sync is over — the same shape of problem session/OAuth-state already solve with a TTL'd KV entry, not a durable table needing its own migration and a sweep job.

One key per user rather than per `syncId`: there is no product need to inspect a past sync's progress or run two concurrent syncs for the same user, so the endpoint only ever exposes "this user's latest sync." Starting a new sync overwrites the previous entry. This also gives the endpoint a natural (if not airtight — see Consequences) concurrent-sync guard: before enqueueing, `handleSyncFollows` checks the existing entry and returns 409 if `status` is `"queued"` or `"running"`.

`processed`/`total` are only meaningful during the `persisting` phase, once the full follow list is known (`channels.length`) and D1 upserts are actively happening — that's the one point a user-facing "X of Y channels synced" number reflects real, bounded work. The two fetch phases (`fetching_channels`, `fetching_streams`) are reported as a phase label only, without a fraction, since Twitch pagination page-count isn't a meaningful unit to show a user.

**3. New status endpoint.**

`GET /api/sync/follows/status` reads `sync_progress:{userId}` for the caller and returns it verbatim (404 if absent — never synced, or the entry expired). The frontend (`useSyncFollows()`) is expected to switch from a single mutation to: `POST` to start, `GET status` polled on a short interval (e.g. every 1–2s) while `status` is `queued`/`running`, stopping on `done`/`failed`.

**4. Interaction with `syncStaleFollows` (ADR 0036).**

The cron path is unaffected: it keeps calling `syncFollowedChannels` directly, synchronously, inside `scheduled()`, with no queue hop and no `onProgress` callback (nothing polls a background cron run, so tracked progress would be dead weight there). The consumer added here is a second caller of the same function, not a replacement — `syncFollowedChannels` gains one new optional parameter and stays otherwise the source of truth for both the manual and scheduled paths, avoiding a fork of the sync logic itself.

**5. Interaction with the incremental-sync sub-task (not yet built).**

That sub-task's proposed shape — skip the expensive full followed-channels refetch on manual syncs unless the list is stale, always refetch the cheap followed-streams — maps directly onto the `fetching_channels` vs `fetching_streams` phases already in the progress enum here. When it lands, a manual sync that skips the channels refetch simply never emits a `fetching_channels` phase update and starts from `fetching_streams`; no change to the progress contract or the queue message shape is needed. This design deliberately keeps "which fetches happen" and "how progress is reported" decoupled so that sub-task can land independently.

## Rejected alternatives

- **Server-Sent Events (SSE) streaming.** Workers can stream a response, but a sync here runs for at most low tens of seconds; a held-open connection (plus client-side `EventSource` reconnect-on-drop handling) is disproportionate complexity for a progress bar the issue describes as "X/Y channels synced," and is visually indistinguishable from 1–2s polling at this duration.
- **WebSockets.** Rejected outright — Workers' WebSocket support is built around Durable Objects for connection state, a new infrastructure primitive this codebase doesn't otherwise use, for a feature that needs neither bidirectional messaging nor a persistent connection.
- **`ctx.executionCtx.waitUntil()` instead of a queue.** Covered above — rejected for coupling the sync's lifetime to the request invocation and losing queues' built-in retry.
- **D1 table for progress state.** Rejected — the data is transient and self-expiring by nature; KV with a TTL is a direct fit already established for this exact category of state, a D1 table would need its own migration and cleanup job for no durability benefit.
- **Progress keyed per `syncId` instead of per-user latest-only.** Rejected for MVP scope — no requirement to view historical or concurrent syncs, and per-user keys double as a cheap (non-atomic) concurrent-sync guard.

## Consequences

- `POST /api/sync/follows`'s response contract changes from `{ ok: true }` (after full completion) to `202 { syncId, status: "queued" }` (immediately) — a breaking change to the existing wire contract; `useSyncFollows()` and any other consumer must be updated alongside this implementation, not as a follow-up.
- Adds a third Cloudflare Queue (`SYNC_JOBS_QUEUE`/`twitch-radar-sync-jobs`), with its own producer/consumer bindings across dev, preview, and production in `wrangler.jsonc`, following the existing per-job-own-queue convention.
- Progress is best-effort, not authoritative: if the consumer's Worker instance is evicted or crashes between catching an error and writing `"failed"`, the KV entry stays stuck at `"running"` until its TTL expires. The frontend should treat a progress poll that stops advancing past some threshold as a failure, rather than polling indefinitely.
- The per-user single-slot key is a soft guard, not a lock: Cloudflare KV has no atomic conditional-write primitive, so two near-simultaneous `POST` calls for the same user (e.g. two open tabs) can still both pass the pre-enqueue check before either writes, and the second `syncId` silently overwrites the first's progress mid-flight. This is an accepted gap at MVP scope — the separate cooldown/rate-limit sub-task in issue #34 is expected to close most of it in practice (a cooldown rejects the second click before it reaches this code at all), but this design does not depend on that sub-task existing first.
- `syncFollowedChannels` gains one new optional `onProgress` parameter; its core logic and the cron caller (`syncStaleFollows`) are otherwise unchanged.
