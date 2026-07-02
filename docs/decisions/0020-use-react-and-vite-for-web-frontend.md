# 0020 - Use React And Vite For The Web Frontend

## Status

Accepted

## Context

T-003 replaces the vanilla JS POC in `apps/web` with a real frontend. The app needs client-side routing, auth-gated views, and interactive state (per-channel and global preferences, live channel polling) that outgrow hand-rolled DOM manipulation.

The build output must be static assets deployable to Cloudflare Pages, with no Node.js runtime dependency at request time.

## Decision

Use React 19 with TypeScript for the frontend, scaffolded and bundled with Vite.

Vite's dev server proxies `/api/*` to the local Wrangler Worker (`http://localhost:8787`) so API requests are same-origin in development, matching the no-CORS production setup.

`vite build` produces static output under `apps/web/dist`, deployed as a Cloudflare Pages project.

## Consequences

- `apps/web` gains React, ReactDOM, Vite, and TypeScript as dependencies (ADR 0012 already isolates these from `apps/api`).
- Local development requires both the Worker (`dev:api`) and the Vite dev server (`dev:web`) running concurrently.
- Build output is framework-agnostic static assets; no SSR or edge-rendering runtime is introduced.
- `apps/web/dist` must stay out of source control and out of lint targets, same as `apps/api`'s build artifacts.
