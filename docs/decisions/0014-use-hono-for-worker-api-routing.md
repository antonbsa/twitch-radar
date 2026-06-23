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
