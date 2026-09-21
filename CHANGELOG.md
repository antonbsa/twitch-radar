# Changelog

Release notes for Twitch Radar. Structured per version into the same five categories `.github/release.yml` uses to generate GitHub Release notes (see [ADR 0049](docs/decisions/0049-changelog-as-source-of-truth-for-release-notes.md)). An `## Unreleased` section, when present, is ignored by the in-app "What's New" widget and its build-time parser.

## v0.1.1 — 2026-08-30

### Migrations & Config

- fix: match queue consumer dispatch by prefix across environments (#56)

### Features

- perf: cut D1 round-trips in follow sync via batching and parallel awaits (#58)
- refactor: batch cleanupMonitoringForBroadcasters D1 queries (#60)
- feat: add cooldown to follow sync (#53)

### Fixes

- fix: surface reconnect-required signal to the user on page load (#50)
- fix: redirect to login with error param when Twitch OAuth is declined (#52)
- fix: fail fast on missing dev secrets and gate deploys on secret presence (#64)

### Docs & Decisions

- chore: enforce and reflow no-hard-wrap markdown formatting (#49)
- docs: add ADR for async follow sync with KV-backed progress polling (#51)
- docs: update PR and issue guidelines to include milestone assignment (#59)
- docs: sharpen PR template Summary/Impact guidance (#62)

### Other Changes

- chore: skip test workflow on docs-only changes (#61)
- chore: scope pre-commit checks to staged files via lint-staged (#57)

## v0.1.0 — 2026-07-31

First production release of Twitch Radar. The PWA supports Twitch OAuth login, automatic syncing of followed channels, per-category monitoring preferences, and real-time push notifications when a monitored channel goes live in a category of interest (via EventSub).

### Migrations & Config

- feat: add `eslint`, `prettier` with CI workflows (#2)
- feat: T-002 — Twitch OAuth, session management, and followed-channels sync (#4)
- feat(tests): Implement `E2E` tests and unify `API` test tiers with shared test-seam (#7)
- feat: implement `T-007` EventSub webhooks and channel state processing (#10)
- feat: Implement `T-008` Notification Delivery And Ops (#11)
- Deploy to Cloudflare production (#12)
- feat: add structured leveled logging and capture error response bodies (#46)

### Features

- feat: Scaffold React frontend for `T-003` (auth, routing, shadcn/ui) (#5)
- feat(web): implement `T-004` UI views (Channels, Alerts, Account) (#6)
- feat: Implement `T-005` PWA (service worker, push notification) (#8)
- feat: Implement `T-006` preferences and broadcaster monitoring (#9)

### Fixes

- fix: batch monitored_channels/channel_state upserts to respect D1's 100-param limit (#44)
- fix: batch ensurePendings eventsub inserts and pass full broadcaster lists (#47)

### Docs & Decisions

- docs: add React+Vite frontend spec tasks (T-003, T-004) and UI layout reference (#3)
- docs: add bug report and feature request issue templates (#14)
- docs: adopt role-scoped Claude Code subagent personas (#39)
- docs: README and project documentation overhaul (#45)
- chore: split deploy workflow into preview/release-gated production, add release & feature skills (#48)

### Other Changes

- chore: add husky pre-commit hook running lint and typecheck (#42)
- refactor: move synthetic id generation from route handlers into repositories (#43)
