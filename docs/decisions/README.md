# Architecture Decision Records

This directory is the only home for accepted project decisions.

Other project documents may state goals, requirements, task scope, validation steps, or implementation facts. They should link here instead of carrying decision rationale or accepted alternatives inline.

## Adding or changing an ADR

Every ADR starts with YAML frontmatter, and the `## Status` prose stays for humans:

```yaml
---
status: Accepted # Proposed | Accepted | Rejected | Superseded
area: notifications # platform | auth | monitoring | notifications | web | operations | testing | delivery | process
amends: ["0062"] # relations are optional: supersedes, superseded-by, amends, amended-by, related
---
```

- The first word of the `## Status` prose must match `status`. A partial supersession is an amendment: the status stays `Accepted` and the relation is `amends`/`amended-by`. A fully replaced ADR is `Superseded` with `superseded-by`.
- Every relation is recorded on both files (`amends` on one, `amended-by` on the other). `related` links an ADR and a TN, written `"TN 0004"` or `"ADR 0042"`.
- Areas: `platform` (stack, API shape, data access), `auth`, `monitoring` (EventSub and Channel State), `notifications`, `web`, `operations` (scheduled jobs, logging, alerting, backups), `testing`, `delivery` (CI, deploy, release), `process` (docs, agents, workflow).
- The index below is generated. After adding an ADR or changing its frontmatter, run `npm run docs:index`; `npm run check-docs` (and CI) fails on invalid frontmatter, a missing inverse relation or a stale index.

## Index

<!-- docs-index:start -->

### Platform

- [0002 — Use Cloudflare Serverless Stack For The MVP](0002-use-cloudflare-serverless-stack-for-mvp.md) · Accepted
- [0003 — Split The MVP Into API, Web, And Infrastructure Roots](0003-split-mvp-into-api-web-and-infra-roots.md) · Accepted
- [0009 — Use A Consistent JSON API Error Shape](0009-use-consistent-json-api-error-shape.md) · Accepted
- [0012 — Use NPM Workspaces For App Packages](0012-use-npm-workspaces-for-app-packages.md) · Accepted
- [0013 — Use Drizzle ORM For D1 Access](0013-use-drizzle-orm-for-d1-access.md) · Accepted
- [0014 — Use Hono For Worker API Routing](0014-use-hono-for-worker-api-routing.md) · Accepted
- [0015 — Generate D1 Migrations With Drizzle Kit](0015-generate-d1-migrations-with-drizzle-kit.md) · Accepted
- [0019 — Followed Channels API Response Shape](0019-followed-channels-response-shape.md) · Accepted
- [0028 — Mirror Wire-Shape Types Across Workspaces Instead Of A Shared Package](0028-mirror-wire-shape-types-across-workspaces.md) · Accepted
- [0058 — Cache Category Box Art In D1 And Attach It To API Responses](0058-cache-category-box-art-in-d1.md) · Accepted
- [0059 — Timestamp-Prefixed D1 Migrations](0059-timestamp-prefixed-d1-migrations.md) · Accepted

### Auth

- [0016 — KV-Backed Session Management](0016-kv-session-management.md) · Accepted
- [0017 — KV Storage for OAuth State Parameter](0017-kv-oauth-state.md) · Accepted
- [0018 — AES-256-GCM Encryption for Twitch Tokens](0018-aes-gcm-token-encryption.md) · Accepted

### Monitoring

- [0004 — Use Twitch EventSub Webhooks](0004-use-twitch-eventsub-webhooks.md) · Accepted
- [0005 — Sync Followed Channels With Twitch Follow And Stream APIs](0005-sync-followed-channels-with-twitch-apis.md) · Accepted
- [0006 — Store Current Channel State Separately From State History](0006-store-current-channel-state-separately-from-history.md) · Accepted
- [0007 — Monitor Broadcasters Globally Across Users](0007-monitor-broadcasters-globally-across-users.md) · Accepted
- [0030 — Monitored Broadcaster Lifecycle And State Seeding](0030-monitored-broadcaster-lifecycle-and-state-seeding.md) · Accepted
- [0031 — EventSub Subscription Creation And Status Lifecycle](0031-eventsub-subscription-creation-and-lifecycle.md) · Accepted
- [0032 — EventSub Webhook Verification And Queueing](0032-eventsub-webhook-verification-and-queueing.md) · Accepted
- [0033 — EventSub State Transition Rules](0033-eventsub-state-transition-rules.md) · Accepted
- [0042 — Async Follow Sync Via Queue With KV-Backed Progress Polling](0042-async-follow-sync-with-progress-polling.md) · Rejected · see TN 0004
- [0049 — EventSub Subscription Failure Backoff, Terminal Status, And Callback Validation](0049-eventsub-subscription-failure-backoff-and-callback-validation.md) · Accepted

### Notifications

- [0008 — Send Category Notifications Only For Future Matching Transitions](0008-send-category-notifications-only-for-future-matching-transitions.md) · Accepted
- [0027 — Push Subscription Lifecycle And API Contract](0027-push-subscription-lifecycle-and-api-contract.md) · Accepted
- [0029 — Category Preference API Contract And Lifecycle](0029-category-preference-api-contract-and-lifecycle.md) · Accepted
- [0034 — Notification Matching And Delivery Pipeline](0034-notification-matching-and-delivery-pipeline.md) · Accepted
- [0035 — Web Push Sends Hand-Rolled On WebCrypto](0035-web-push-via-webcrypto.md) · Accepted
- [0048 — Notification Snooze Reminders](0048-notification-snooze-reminders.md) · Accepted
- [0051 — Suppress Notifications For Non-Live Stream Types](0051-suppress-non-live-stream-type-notifications.md) · Accepted
- [0054 — User-Controlled Notification Suppression: Pause, Broadcaster Mute, Global Category Exclusions](0054-user-controlled-notification-suppression.md) · Accepted
- [0055 — Client-Side Notification Digest](0055-client-side-notification-digest.md) · Rejected · see TN 0007
- [0056 — Send-Side Notification Cooldown Per User And Broadcaster](0056-send-side-notification-cooldown.md) · Accepted

### Web

- [0020 — Use React And Vite For The Web Frontend](0020-use-react-and-vite-for-web-frontend.md) · Accepted
- [0021 — Use Tailwind CSS For Styling](0021-use-tailwind-css-for-styling.md) · Accepted
- [0022 — Use shadcn/ui For Component Primitives](0022-use-shadcn-ui-for-component-primitives.md) · Accepted
- [0023 — Use TanStack Query For Server State](0023-use-tanstack-query-for-server-state.md) · Accepted
- [0024 — Use React Router v7 For Client Routing](0024-use-react-router-v7-for-client-routing.md) · Accepted
- [0026 — Manual Service Worker And Manifest Without vite-plugin-pwa](0026-manual-service-worker-without-vite-plugin-pwa.md) · Accepted
- [0044 — I18n Key-Based Catalog And Language Preference](0044-i18n-key-based-catalog-and-language-preference.md) · Accepted

### Operations

- [0036 — Scheduled Ops Jobs: Reconciliation, Token Refresh, Follow Sync](0036-scheduled-ops-jobs.md) · Accepted · amended by 0057
- [0040 — Structured Leveled Logging Convention](0040-structured-leveled-logging-convention.md) · Accepted
- [0047 — Error Alerting Via The Sentry SDK And A Direct Slack Webhook](0047-error-alerting-via-sentry-and-slack-webhook.md) · Accepted
- [0053 — Self-Describing Scheduled Job Logs](0053-self-describing-scheduled-job-logs.md) · Accepted · amended by 0057
- [0057 — Single Minutely Cron Trigger With Time-Based Job Dispatch](0057-single-minutely-cron-trigger.md) · Accepted · amends 0036, 0053
- [0063 — Scheduled Encrypted D1 Exports To Backblaze B2](0063-scheduled-encrypted-d1-exports-to-backblaze-b2.md) · Accepted

### Testing

- [0011 — Keep API Tests Under Root Tests Api](0011-keep-api-tests-under-root-tests-api.md) · Accepted
- [0025 — E2E UI Tests With Playwright And A Guarded Test-Seam Endpoint](0025-e2e-ui-tests-with-playwright-and-test-seam.md) · Accepted · amended by 0064
- [0045 — Build-Time Exclusion Of Non-Production Test/Dev Code](0045-build-time-exclusion-of-non-production-test-code.md) · Accepted
- [0046 — Sandbox Personas For Twitch-Free Dev And Preview Access](0046-sandbox-personas-for-dev-and-preview.md) · Accepted
- [0064 — Web Unit Tests As Their Own Tier](0064-web-unit-tests-as-their-own-tier.md) · Accepted · amends 0025

### Delivery

- [0037 — Single `PUBLIC_URL`, Same-Origin API And Web In Every Environment](0037-single-public-url-same-origin-deployment.md) · Accepted
- [0041 — Release-Gated Production Deploys, Automatic Preview Deploys](0041-release-gated-production-deploys.md) · Accepted
- [0050 — CHANGELOG.md As The Source Of Truth For Release Notes](0050-changelog-as-source-of-truth-for-release-notes.md) · Accepted
- [0060 — Publish Failed CI Test Reports To A Separate Pages Repo](0060-publish-failed-ci-test-reports-to-a-pages-repo.md) · Accepted
- [0061 — Concurrency Rules For CI And Deploy Workflows](0061-concurrency-rules-for-ci-and-deploy-workflows.md) · Accepted

### Process

- [0001 — Keep Project Decisions In ADRs](0001-keep-project-decisions-in-adrs.md) · Accepted
- [0010 — Keep The POC Separate From The MVP Architecture](0010-keep-poc-separate-from-mvp-architecture.md) · Accepted
- [0038 — Adopt Role-Scoped Claude Code Subagents, Reject The Rest Of The Agent-Context-Template Pattern](0038-adopt-role-scoped-subagents-reject-template.md) · Accepted · amended by 0052, 0062
- [0039 — Adopt Technical Notes For Non-Decision Research](0039-adopt-technical-notes-for-non-decision-research.md) · Accepted
- [0043 — GitHub Issues As Spec; Drop The Mandatory Per-Feature Spec Document](0043-github-issues-as-spec-drop-mandatory-spec-docs.md) · Accepted · amended by 0065
- [0052 — Agent Instructions: Nested AGENTS.md For Conventions, Subagents For Persona And Boundaries](0052-nested-agents-md-and-slim-subagents.md) · Accepted · amends 0038
- [0062 — Human-Facing Architecture Documentation](0062-human-facing-architecture-docs.md) · Accepted · amends 0038 · amended by 0065
- [0065 — Organize Human Docs By Reader Moment, With Generated Indexes](0065-organize-human-docs-by-reader-moment.md) · Accepted · amends 0043, 0062
- [0066 — Isolated Pre-PR Review By Fresh Subagents](0066-isolated-pre-pr-review-by-fresh-subagents.md) · Accepted

<!-- docs-index:end -->
