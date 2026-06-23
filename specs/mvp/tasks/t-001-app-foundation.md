# T-001: App Foundation

## Goal

Create the deployable MVP foundation and establish the durable data model used by later tasks.

## Decision References

- [ADR 0002: Cloudflare serverless stack](../../../docs/decisions/0002-use-cloudflare-serverless-stack-for-mvp.md)
- [ADR 0003: API, web, and infrastructure roots](../../../docs/decisions/0003-split-mvp-into-api-web-and-infra-roots.md)
- [ADR 0006: current state and history](../../../docs/decisions/0006-store-current-channel-state-separately-from-history.md)
- [ADR 0009: JSON API error shape](../../../docs/decisions/0009-use-consistent-json-api-error-shape.md)

## Spec Work

Define or confirm:

- project structure.
- Worker route layout.
- database binding and migration strategy.
- queue binding names.
- cache binding names.
- environment variables and secrets.
- local development setup.
- deployment environments.
- API error response conventions.

## Implementation Scope

- project scaffold.
- Worker routing foundation.
- D1 database migrations.
- typed database access layer.
- shared domain types.
- configuration loading.
- error response conventions.
- basic health endpoint.
- local development setup with Wrangler.

## Core Tables

Implement migrations for:

- `users`
- `twitch_tokens`
- `push_subscriptions`
- `followed_channels`
- `monitored_channels`
- `eventsub_subscriptions`
- `channel_state`
- `channel_state_changes`
- `channel_category_preferences`
- `global_category_preferences`
- `notification_deliveries`

## Acceptance Criteria

- App can run locally with Wrangler.
- Worker can connect to local D1.
- Migrations can be applied from a clean database.
- Database tables match the MVP spec or documented accepted changes.
- Health endpoint returns a successful response.
- API errors use one consistent JSON response shape.
- Database access layer has tests for basic insert/read/update paths.
- README includes the correct MVP local development commands after the Cloudflare scaffold exists.

## Completion Validation

- `wrangler dev` starts the app locally.
- D1 migrations apply successfully from an empty database.
- Health endpoint returns `200`.
- Foundation tests pass.
- No POC-only storage patterns are introduced as MVP source of truth.

## Dependencies

None.
