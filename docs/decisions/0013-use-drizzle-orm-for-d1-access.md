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

## Consequences

- Repository methods should use Drizzle query APIs instead of raw D1 prepared SQL for ordinary CRUD.
- The migration SQL and Drizzle schema must stay aligned.
- Future schema changes should update both the D1 migration and Drizzle schema.
