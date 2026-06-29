# 0015 - Generate D1 Migrations With Drizzle Kit

## Status

Accepted

## Context

The API already uses Drizzle schema definitions for typed D1 access. Handwriting migrations separately from `apps/api/src/db/schema.ts` would duplicate schema work and increase drift risk.

Drizzle Kit can generate SQL migration files from Drizzle schema changes.

## Decision

Use `apps/api/src/db/schema.ts` as the authoring source for future D1 schema changes.

Generate SQL migrations with Drizzle Kit into `infra/migrations`.

Apply generated migrations to D1 with Wrangler.

Review generated SQL before applying or committing it.

## Consequences

- Future schema changes start by editing `apps/api/src/db/schema.ts`.
- `npm run migrations:create -- --name <descriptive_name>` generates the next SQL migration and Drizzle metadata.
- `npm run db:check` validates generated migration metadata.
- `npm run db:setup` remains the D1 apply command.
- The initial migration is baselined with Drizzle Kit metadata so future generated migrations diff against the current schema.
