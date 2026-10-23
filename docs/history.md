# Project History

What each stage of Twitch Radar set out to do and what it delivered. The plans written along the way were removed from the repository once they stopped matching the code; they are preserved at tag `v0.4.0`, linked at the end of each section. For how the system works now see the [architecture overview](architecture/overview.md).

## Proof Of Concept

**Goal.** Show that a backend can push a Web Push notification to an installed iOS PWA, before building anything around Twitch.

**What was built.**

- A PWA with a service worker, notification permission and a Push API subscription.
- A backend that stored subscriptions and, after a configured delay, sent a notification for a predefined Twitch-like channel option.
- A view of pending and triggered notifications.

**Notable decisions.** The proof of concept was kept apart from the real architecture so it could be discarded ([ADR 0010](decisions/0010-keep-poc-separate-from-mvp-architecture.md)). It did not cover Twitch OAuth, category search or any Twitch event source.

**What changed afterwards.** The MVP replaced the simulated event with real Twitch events and the proof of concept's storage and runtime with the Cloudflare stack. Its central finding, that the installed PWA is where iOS notifications work, still shapes the design ([overview](architecture/overview.md)).

Original files: [specs/poc at v0.4.0](https://github.com/antonbsa/twitch-radar/tree/v0.4.0/specs/poc).

## MVP

**Goal.** A mobile-first PWA where a user connects Twitch, picks the categories they care about, and gets a push when a followed streamer starts or switches into one of them.

**What was built.**

- Twitch sign-in with server-side sessions, and a sync of the user's followed channels with who is live.
- A React app with Channels, Alerts and Account tabs behind a login gate, in the style of Twitch's sidebar.
- Per-channel and global category preferences, and a global set of monitored broadcasters with EventSub subscriptions managed by the backend.
- A signed webhook, an events queue, and a current-state record separate from the history of relevant transitions.
- Preference matching, delivery records with deduplication, and Web Push sent from the Worker.
- Scheduled jobs for subscription reconciliation, token refresh and follow sync.
- Unit, API and end-to-end test tiers.

**Notable decisions.** Cloudflare Workers, D1 and KV ([ADR 0002](decisions/0002-use-cloudflare-serverless-stack-for-mvp.md)); EventSub webhooks instead of polling ([ADR 0004](decisions/0004-use-twitch-eventsub-webhooks.md)); current state stored apart from history ([ADR 0006](decisions/0006-store-current-channel-state-separately-from-history.md)); monitoring broadcasters once across all users ([ADR 0007](decisions/0007-monitor-broadcasters-globally-across-users.md)); notifying only on future matching transitions ([ADR 0008](decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)). The rest of the stack and the push, EventSub and matching rules are in ADRs 0011 to 0037.

**What changed afterwards.** The plan was organized as one spec and a set of phase tasks (foundation, auth and sync, frontend, PWA and push, preferences, EventSub and state, delivery). From milestone 1 on, work is driven by GitHub issues instead of committed specs ([ADR 0043](decisions/0043-github-issues-as-spec-drop-mandatory-spec-docs.md)). The system description moved into [docs/architecture](architecture/overview.md) and the [product overview](product.md), which also cover later work: snooze, suppression controls, cooldown and languages.

Original files: [specs/mvp at v0.4.0](https://github.com/antonbsa/twitch-radar/tree/v0.4.0/specs/mvp).

## Milestone 0: Foundations

**Goal.** Make the deployed Worker and PWA diagnosable after the fact, starting with leveled, structured logging (issue 19).

**What was built.**

- A thin structured logger with levels chosen per environment, and Workers Logs capture at full sampling.
- Error paths that keep the failing response body, stack and cause that earlier code discarded before it reached a log call.

**Notable decisions.** A small custom wrapper instead of a logging library, and the level derived from the environment instead of a new variable ([ADR 0040](decisions/0040-structured-leveled-logging-convention.md)).

**What changed afterwards.** This was the last milestone with a committed spec. [ADR 0043](decisions/0043-github-issues-as-spec-drop-mandatory-spec-docs.md) moved milestone 1 onward to spec-shaped GitHub issues, and [ADR 0065](decisions/0065-organize-human-docs-by-reader-moment.md) removed the spec files.

Original file: [specs/milestones/0-foundations at v0.4.0](https://github.com/antonbsa/twitch-radar/tree/v0.4.0/specs/milestones/0-foundations).

## Since Then

Milestone 1 onward is recorded in the GitHub milestones, the closed issues and the releases, not in files.
