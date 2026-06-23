# 0003 - Split The MVP Into API, Web, And Infrastructure Roots

## Status

Accepted

## Context

The MVP has separate deployment targets for the Worker API and the Pages frontend, plus infrastructure artifacts that need to be applied outside either app build.

## Decision

Use this project layout:

- `apps/api` for the Cloudflare Worker backend.
- `apps/web` for the Cloudflare Pages frontend.
- `infra/migrations` for Cloudflare D1 migrations.

Use explicit local database setup:

- `npm run db:setup` applies local D1 migrations.
- `npm run dev` starts the API Worker and does not apply migrations.

Use these initial Worker bindings:

- D1: `DB`
- KV: `APP_CACHE`
- Queue producers: `TWITCH_EVENTS_QUEUE`, `NOTIFICATION_JOBS_QUEUE`

## Consequences

- Frontend and backend work can evolve independently while staying in one repo.
- Local D1 schema setup is visible and repeatable instead of hidden in dev startup.
- Future infrastructure scripts should keep migrations under `infra/migrations`.
