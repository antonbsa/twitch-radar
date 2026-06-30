# 0014 - Use Hono For Worker API Routing

## Status

Accepted

## Context

The API runs on Cloudflare Workers. The initial foundation used a small custom Fetch router, but route count will grow across auth, preferences, push subscriptions, webhooks, and operational endpoints.

Hono is a lightweight web framework documented for Cloudflare Workers.

## Decision

Use Hono for Worker API routing.

Do not use Fastify for the MVP Worker API.

## Consequences

- Worker route modules should be Hono apps or route registrations.
- Error handling should preserve the accepted JSON API error shape.
- Hono context `env` provides access to Worker bindings.
- `HonoEnv` (defined in `env.ts`) carries both `Bindings` (Worker env) and `Variables` (per-request deps).
- Per-request shared dependencies (e.g. `db`) are set in middleware via `c.set()` and read in handlers via `c.var`.
- Route handlers live in `http/routes/<name>.ts` and are imported into `index.ts` for registration.
- There is no `router.ts`; the Hono app is constructed directly in `index.ts`.
