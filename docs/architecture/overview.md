# Architecture Overview

How Twitch Radar works end to end and why it is built this way. This page is the map; each subsystem has its own page under [docs/architecture](.), and every decision links the ADR (or technical note) that records it. For what the product does see [product.md](../product.md).

The pages describe the system as it is now, by concept (the Worker, the queues, scheduled jobs), not by file. Coding conventions live in the [`AGENTS.md`](../../AGENTS.md) files, and the history of each decision in the [ADRs](../decisions/README.md).

## Constraints That Shape The Design

- **Cloudflare's free plan.** The whole backend runs on it, so the design is bounded by its limits: a small per-invocation subrequest budget (50), cron triggers capped per account (5), and daily write quotas on KV. Several choices below exist only to stay inside those numbers (a single cron trigger, no per-event KV writes, capped job batches).
- **The installed iOS PWA is the primary platform.** Web Push on an installed iOS app behaves differently from Chromium and from the specs: some notification APIs report nothing, tags don't replace earlier notifications, and an offline device loses pushes at Apple's push service. The delivery design stays on what is known to work there, and rejects what isn't ([ADR 0055](../decisions/0055-client-side-notification-digest.md), [TN 0007](../notes/0007-client-side-notification-digest-not-viable-on-ios.md)).
- **Twitch pushes events, the app never polls.** Knowing that a streamer switched category within seconds, for every followed channel of every user, is only affordable through EventSub webhooks ([ADR 0004](../decisions/0004-use-twitch-eventsub-webhooks.md)). That makes the system event-driven, and it has to cope with out-of-order and repeated deliveries.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Runtime | One Cloudflare Worker serving the API, the queue consumers, the cron and the PWA assets | A serverless fit for a webhook-driven workload with no always-on process ([ADR 0002](../decisions/0002-use-cloudflare-serverless-stack-for-mvp.md)), and one origin for API and web ([ADR 0037](../decisions/0037-single-public-url-same-origin-deployment.md)). |
| HTTP framework | Hono | Small, runs natively on Workers ([ADR 0014](../decisions/0014-use-hono-for-worker-api-routing.md)). |
| Durable state | D1 (SQLite) through Drizzle | Relational data with unique keys the idempotency rules lean on ([ADR 0013](../decisions/0013-use-drizzle-orm-for-d1-access.md), [ADR 0015](../decisions/0015-generate-d1-migrations-with-drizzle-kit.md)). |
| Short-lived state | KV | Sessions, OAuth state and the Twitch app token: self-expiring entries that need no sweep ([ADR 0016](../decisions/0016-kv-session-management.md), [ADR 0017](../decisions/0017-kv-oauth-state.md)). |
| Async work | Two Queues: Twitch events and notification jobs | Decouple "accept the webhook quickly" from "process it", and "decide to notify" from "send the push" ([ADR 0032](../decisions/0032-eventsub-webhook-verification-and-queueing.md), [ADR 0034](../decisions/0034-notification-matching-and-delivery-pipeline.md)). |
| Periodic work | One minutely Cron Trigger | The account-wide cap leaves no room for a trigger per job ([ADR 0057](../decisions/0057-single-minutely-cron-trigger.md)). |
| Web client | React, Vite, Tailwind, shadcn/ui, TanStack Query, React Router | A mobile-first PWA with server state in a cache ([ADR 0020](../decisions/0020-use-react-and-vite-for-web-frontend.md), [ADR 0023](../decisions/0023-use-tanstack-query-for-server-state.md)). |
| Service worker | Hand-written, no build step | It only handles push and notification clicks; no offline caching to justify a plugin ([ADR 0026](../decisions/0026-manual-service-worker-without-vite-plugin-pwa.md)). |
| Web Push | Protocol implemented on WebCrypto | The usual library depends on Node modules a Worker lacks ([ADR 0035](../decisions/0035-web-push-via-webcrypto.md)). |

## Components

```mermaid
flowchart LR
    subgraph Device
        PWA["Installed PWA"]
        SW["Service worker"]
    end

    subgraph Cloudflare["Cloudflare Worker"]
        API["HTTP API"]
        EQ[("Twitch events queue")]
        NQ[("Notification jobs queue")]
        CRON["Minutely cron"]
        D1[("D1")]
        KV[("KV")]
    end

    Twitch["Twitch<br/>OAuth, Helix, EventSub"]
    PUSH["Push services<br/>APNs, FCM, Mozilla"]

    PWA -->|"session cookie"| API
    API --> D1
    API --> KV
    API <-->|"OAuth, follows, streams"| Twitch
    Twitch -->|"signed webhooks"| API
    API --> EQ
    EQ -->|"state + matching"| D1
    EQ --> NQ
    CRON --> D1
    CRON <-->|"subscriptions, tokens, follows"| Twitch
    CRON --> NQ
    NQ -->|"encrypted push"| PUSH
    PUSH --> SW
    SW --> PWA
```

The Worker is one deployable with four entry points: HTTP requests, the two queue consumers and the scheduled handler. Server code is organized by feature (auth, channels, eventsub, notifications, preferences, push), with shared services for Twitch and a thin data layer in front of D1.

## Paths Through The System

**Setting up** ([auth](auth.md), [follow sync](follow-sync.md), [monitoring](monitoring.md)). The user signs in with Twitch, the app reads their follows, and choosing an alert makes the broadcasters involved _monitored_: the backend subscribes to Twitch events for them, once per broadcaster, however many users care.

**An event arrives** ([monitoring](monitoring.md), [state and matching](state-and-matching.md), [delivery](notification-delivery.md)).

```mermaid
sequenceDiagram
    participant T as Twitch
    participant W as Webhook handler
    participant E as Events queue
    participant P as Event processor
    participant M as Matcher
    participant N as Jobs queue
    participant S as Sender
    participant D as Device

    T->>W: stream.online / channel.update / stream.offline
    W->>W: verify signature on raw body
    W->>E: enqueue, answer 204
    E->>P: message
    P->>P: dedupe, stale guard, update channel state
    P->>M: relevant transition
    M->>M: match preferences, apply suppression and cooldown
    M->>N: one job per user to notify
    N->>S: job
    S->>D: encrypted Web Push
```

**Staying healthy** ([scheduled jobs](scheduled-jobs.md)). A minutely cron creates pending subscriptions, fires snooze reminders and refreshes Twitch tokens; every half hour it reconciles subscriptions with Twitch, and hourly it re-syncs stale follows.

## Data Model

```mermaid
erDiagram
    users ||--o| twitch_tokens : "has"
    users ||--o{ push_subscriptions : "registers"
    users ||--o{ followed_channels : "follows"
    users ||--o{ channel_category_preferences : "sets"
    users ||--o{ global_category_preferences : "sets"
    users ||--o{ broadcaster_mutes : "mutes"
    users ||--o{ notification_snoozes : "requests"
    users ||--o{ notification_deliveries : "receives"
    global_category_preferences ||--o{ global_category_preference_exclusions : "excludes"
    monitored_channels ||--o{ eventsub_subscriptions : "needs"
    monitored_channels ||--o| channel_state : "current state"
    monitored_channels ||--o{ channel_state_changes : "history"
    followed_channels }o..o| channel_state : "seeds"
    push_subscriptions |o--o{ notification_deliveries : "sent via"
```

Relations between per-user and per-broadcaster tables go through the Twitch broadcaster id, not a database foreign key.

The model separates three kinds of data:

- **Per user:** the account, the encrypted Twitch tokens, push subscriptions, follows, preferences and the controls that suppress notifications (mutes, exclusions, pause, snoozes).
- **Per broadcaster, shared by everyone:** which broadcasters are monitored, their EventSub subscriptions, their current state and the history of relevant transitions ([ADR 0006](../decisions/0006-store-current-channel-state-separately-from-history.md), [ADR 0007](../decisions/0007-monitor-broadcasters-globally-across-users.md)). Twitch is asked once per broadcaster, not once per follower.
- **Audit:** one delivery row per notification decision, with a terminal status, so "did the push go out" is a single query.

A small cache table holds category artwork ([ADR 0058](../decisions/0058-cache-category-box-art-in-d1.md)). Everything the API exposes to the web client is documented in [api-contract.md](../reference/api-contract.md); the two sides mirror their wire types by hand instead of sharing a package ([ADR 0028](../decisions/0028-mirror-wire-shape-types-across-workspaces.md)).

## Defining Trade-offs

- **Event-driven, not polling.** EventSub webhooks give near-instant category changes at no per-poll cost, at the price of handling retries, reordering and revocations. Both `stream.online` and `channel.update` are needed, because neither alone covers every case ([ADR 0004](../decisions/0004-use-twitch-eventsub-webhooks.md)).
- **Monitor broadcasters globally.** One subscription set per broadcaster, shared by all users. A user with a global alert makes every channel they follow monitored, so subscription count grows with follows, bounded by Twitch's cost cap ([ADR 0007](../decisions/0007-monitor-broadcasters-globally-across-users.md), [TN 0003](../notes/0003-eventsub-subscription-cost-of-broadening-monitoring-scope.md)).
- **A single minutely cron trigger.** Jobs share one trigger and are picked by the scheduled minute, rather than each owning a trigger the account can't afford. They share one invocation's subrequest budget, so every job is capped per run ([ADR 0057](../decisions/0057-single-minutely-cron-trigger.md)).
- **Send-side cooldown.** At most one push per user and broadcaster every 15 minutes, decided before anything is queued, so a flapping streamer can't flood a device ([ADR 0056](../decisions/0056-send-side-notification-cooldown.md)).
- **No client-side digest.** Merging a burst into one notification in the service worker was built and rejected after trying it on an installed iOS PWA ([ADR 0055](../decisions/0055-client-side-notification-digest.md), [TN 0007](../notes/0007-client-side-notification-digest-not-viable-on-ios.md)).
- **Late is worse than missed.** Pushes are never retried automatically and expire after an hour at the push service, since an old category alert is stale and a retry could double-notify surviving devices ([ADR 0034](../decisions/0034-notification-matching-and-delivery-pipeline.md), [ADR 0035](../decisions/0035-web-push-via-webcrypto.md)).
- **Idempotency over ordering.** EventSub guarantees neither order nor uniqueness, so every stage tolerates replays instead of trying to prevent them ([ADR 0033](../decisions/0033-eventsub-state-transition-rules.md)).
- **Hand-mirrored wire types.** Two small DTO sets, edited together, are cheaper than a shared package that would blur the isolation between the Worker and the browser bundle ([ADR 0028](../decisions/0028-mirror-wire-shape-types-across-workspaces.md)).
- **Same-origin everywhere.** API and web share one public URL in every environment, so cookies, OAuth redirects and webhook callbacks derive from a single value ([ADR 0037](../decisions/0037-single-public-url-same-origin-deployment.md)).

## Scaling Limits

The design is sized for a small user base on the free plan. These are the limits, in the order they bind as users and follows grow; the first two are already encoded in the code, the rest are headroom that hasn't been measured against real load.

| Limit | What consumes it | What happens at the limit |
| --- | --- | --- |
| **Subrequests per invocation (50)** | Every Twitch call and every Queue send in a cron run or a queue batch; D1 queries are not counted | Each job is capped per run (below), so a backlog drains over later minutes instead of failing the invocation ([scheduled jobs](scheduled-jobs.md), [ADR 0057](../decisions/0057-single-minutely-cron-trigger.md)). |
| **Subscription creation throughput** | One Twitch call per pending subscription, 3 per broadcaster: 30 creates a run, 10 on minutes that also run a periodic job | About 10 new broadcasters a minute, 3 on a periodic minute. Promoting a large follow graph at once (a user enabling a global alert) takes hours to reach full push coverage; channel state is seeded immediately, so only future transitions wait ([TN 0003](../notes/0003-eventsub-subscription-cost-of-broadening-monitoring-scope.md)). |
| **EventSub `max_total_cost`** | 1 point per subscription for broadcasters who haven't authorized the app, which is nearly all of them | Twitch rejects new subscriptions. The ceiling grows with users who authorize the app, not with follows, and Twitch doesn't publish it, so it is the first limit that follow growth can break from outside the Worker ([TN 0003](../notes/0003-eventsub-subscription-cost-of-broadening-monitoring-scope.md)). |
| **Reconciliation loads whole tables** | The local subscription and monitored-channel tables plus Twitch's full list, every 30 minutes, with at most 20 remote deletes a run | Fine at current size; it needs paging once the broadcaster count is large ([ADR 0036](../decisions/0036-scheduled-ops-jobs.md)). |
| **Other per-run caps** | Token refresh (2 refreshes and 3 validations a run), snooze sweep (30 a run), follow re-sync (3 users an hour) | Each is a drain rate, not a failure point: the follow re-sync only serves users who have been away for a day, because anyone opening the app syncs on load ([follow sync](follow-sync.md)). |
| **KV daily write quota** | Logins, the one-time OAuth state, session renewals (about one a week per active user) and the app token | Writes would start failing. Per-event KV writes were removed for this reason (webhook dedupe, a token-refresh lock), which leaves writes proportional to logins and active users, not to Twitch traffic ([auth](auth.md), [monitoring](monitoring.md)). |
| **Helix rate limits** | The stream lookup when an event arrives, batched 100 per request on the shared app token | Scales with distinct live monitored broadcasters, not with users, and has orders of magnitude of headroom ([TN 0001](../notes/0001-viewer-count-freshness-and-rate-limit-scalability.md), [TN 0002](../notes/0002-viewer-count-cron-sufficiency-for-twitch-like-freshness.md)). |

At 10x the users, the first thing to break is the Twitch-side subscription cost cap if the extra users bring many new broadcasters, and the first thing to hurt is the time a new global alert takes to reach full coverage. Neither is visible in the app until it bites: Twitch returns the current cost and cap on the list call reconciliation already makes, but nothing records them yet ([TN 0003](../notes/0003-eventsub-subscription-cost-of-broadening-monitoring-scope.md) proposes how). The growth of the append-only tables in D1 is a separate, slower concern with no pruning today.

## Security

The controls live in the subsystem pages; this is the map of them.

- **Identity.** Twitch is the only login, with one read scope. The OAuth `state` is one-time and expires in ten minutes ([auth](auth.md), [ADR 0017](../decisions/0017-kv-oauth-state.md)).
- **Sessions.** An opaque id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie backed by KV, with a hard 180-day ceiling; logout deletes the entry, so it is immediate ([ADR 0016](../decisions/0016-kv-session-management.md)).
- **Stored credentials.** Twitch tokens are encrypted with AES-256-GCM in D1; a dead refresh token is flagged instead of retried forever ([ADR 0018](../decisions/0018-aes-gcm-token-encryption.md)).
- **Webhook.** Authenticated by an HMAC over the raw body, compared in constant time, with a ten-minute replay window ([monitoring](monitoring.md), [ADR 0032](../decisions/0032-eventsub-webhook-verification-and-queueing.md)). Subscriptions are only touched when their callback URL is this deployment's own, since environments share one Twitch application.
- **Push.** Payloads are end-to-end encrypted to the device and signed with per-environment VAPID keys ([notification delivery](notification-delivery.md), [ADR 0035](../decisions/0035-web-push-via-webcrypto.md)).
- **Attack surface.** The test and sandbox routes are compiled out of the production bundle, and a check verifies it ([testing](testing.md), [ADR 0046](../decisions/0046-sandbox-personas-for-dev-and-preview.md)).
- **Tokens never reach the browser.** The client calls only this API; every Twitch call is made server-side.

## Recovery

Reconciliation repairs what is derived from Twitch: after a database reset it recreates the EventSub subscriptions for the monitored set. What it can't recover is what only this system knew: users, their encrypted Twitch tokens, push subscriptions, preferences and delivery history. Those come back only from a D1 restore: Time Travel for a recent logical error, or the daily encrypted off-site export if the database itself is gone, at most a day old ([ADR 0063](../decisions/0063-scheduled-encrypted-d1-exports-to-backblaze-b2.md), [backup and restore](../operations/backup-and-restore.md)). A restore is only usable with the original token-encryption key and push keypair, which live outside Cloudflare. KV needs none: sessions, OAuth state and the app token are disposable, and losing them only logs people out.

## Where To Go Next

| Page | Covers |
| --- | --- |
| [Auth and sessions](auth.md) | Twitch OAuth, sessions, token storage and refresh |
| [Follow sync](follow-sync.md) | How follows and live state get from Twitch into the app |
| [Monitoring and EventSub](monitoring.md) | Which broadcasters are watched, subscription lifecycle, the webhook |
| [State transitions and matching](state-and-matching.md) | Turning events into channel state, and transitions into the users to notify |
| [Notification delivery](notification-delivery.md) | Push, snooze, suppression, cooldown |
| [Scheduled jobs](scheduled-jobs.md) | The minutely cron and what runs on it |
| [Web client](web-client.md) | Routes, server-state cache, foreground sync, the service worker |
| [Observability and alerting](observability.md) | Logs, error alerting |
| [Testing strategy](testing.md) | The two test tiers, the test seam and the sandbox |
| [Deploy and release](deploy-and-release.md) | Environments, CI, preview and production |
| [Engineering process](engineering-process.md) | How the project itself is run |
