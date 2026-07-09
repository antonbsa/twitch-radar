# Architecture Decision Records

This directory is the only home for accepted project decisions.

Other project documents may state goals, requirements, task scope, validation steps, or implementation facts. They should link here instead of carrying decision rationale or accepted alternatives inline.

## Accepted ADRs

- [0001 - Keep Project Decisions In ADRs](0001-keep-project-decisions-in-adrs.md)
- [0002 - Use Cloudflare Serverless Stack For The MVP](0002-use-cloudflare-serverless-stack-for-mvp.md)
- [0003 - Split The MVP Into API, Web, And Infrastructure Roots](0003-split-mvp-into-api-web-and-infra-roots.md)
- [0004 - Use Twitch EventSub Webhooks](0004-use-twitch-eventsub-webhooks.md)
- [0005 - Sync Followed Channels With Twitch Follow And Stream APIs](0005-sync-followed-channels-with-twitch-apis.md)
- [0006 - Store Current Channel State Separately From State History](0006-store-current-channel-state-separately-from-history.md)
- [0007 - Monitor Broadcasters Globally Across Users](0007-monitor-broadcasters-globally-across-users.md)
- [0008 - Send Category Notifications Only For Future Matching Transitions](0008-send-category-notifications-only-for-future-matching-transitions.md)
- [0009 - Use A Consistent JSON API Error Shape](0009-use-consistent-json-api-error-shape.md)
- [0010 - Keep The POC Separate From The MVP Architecture](0010-keep-poc-separate-from-mvp-architecture.md)
- [0011 - Keep API Tests Under Root Tests Api](0011-keep-api-tests-under-root-tests-api.md)
- [0012 - Use NPM Workspaces For App Packages](0012-use-npm-workspaces-for-app-packages.md)
- [0013 - Use Drizzle ORM For D1 Access](0013-use-drizzle-orm-for-d1-access.md)
- [0014 - Use Hono For Worker API Routing](0014-use-hono-for-worker-api-routing.md)
- [0015 - Generate D1 Migrations With Drizzle Kit](0015-generate-d1-migrations-with-drizzle-kit.md)
- [0016 - KV-Backed Session Management](0016-kv-session-management.md)
- [0017 - KV-Backed OAuth State](0017-kv-oauth-state.md)
- [0018 - AES-GCM Token Encryption](0018-aes-gcm-token-encryption.md)
- [0019 - Flat Array Response Shape For Followed Channels](0019-followed-channels-response-shape.md)
- [0020 - Use React And Vite For The Web Frontend](0020-use-react-and-vite-for-web-frontend.md)
- [0021 - Use Tailwind CSS For Styling](0021-use-tailwind-css-for-styling.md)
- [0022 - Use shadcn/ui For Component Primitives](0022-use-shadcn-ui-for-component-primitives.md)
- [0023 - Use TanStack Query For Server State](0023-use-tanstack-query-for-server-state.md)
- [0024 - Use React Router v7 For Client Routing](0024-use-react-router-v7-for-client-routing.md)
- [0025 - E2E UI Tests With Playwright And A Guarded Test-Seam Endpoint](0025-e2e-ui-tests-with-playwright-and-test-seam.md)
- [0026 - Manual Service Worker And Manifest Without vite-plugin-pwa](0026-manual-service-worker-without-vite-plugin-pwa.md)
- [0027 - Push Subscription Lifecycle And API Contract](0027-push-subscription-lifecycle-and-api-contract.md)
- [0028 - Mirror Wire-Shape Types Across Workspaces Instead Of A Shared Package](0028-mirror-wire-shape-types-across-workspaces.md)
- [0029 - Category Preference API Contract And Lifecycle](0029-category-preference-api-contract-and-lifecycle.md)
- [0030 - Monitored Broadcaster Lifecycle And State Seeding](0030-monitored-broadcaster-lifecycle-and-state-seeding.md)
- [0031 - EventSub Subscription Creation And Status Lifecycle](0031-eventsub-subscription-creation-and-lifecycle.md)
- [0032 - EventSub Webhook Verification And Queueing](0032-eventsub-webhook-verification-and-queueing.md)
- [0033 - EventSub State Transition Rules](0033-eventsub-state-transition-rules.md)
