# 0013 - Use Drizzle ORM For D1 Access

## Status

Accepted

## Context

The initial D1 repositories used raw prepared SQL. That works for the foundation, but the schema and query surface will grow across auth, preferences, EventSub state, and notification delivery.

Drizzle ORM supports Cloudflare D1 and Cloudflare Workers.

## Decision

Use Drizzle ORM for D1 database access in the Worker API.

Keep SQL migration files under `infra/migrations` as the applied D1 migration source.

Use Drizzle schema definitions in API code to provide type-safe query building over the migrated tables.

Migration generation is covered by [ADR 0015](0015-generate-d1-migrations-with-drizzle-kit.md).

## Consequences

- Repository methods should use Drizzle query APIs instead of raw D1 prepared SQL for ordinary CRUD.
- The Drizzle schema and applied D1 migrations must stay aligned.
