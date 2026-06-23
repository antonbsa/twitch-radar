# 0002 - Use Cloudflare Serverless Stack For The MVP

## Status

Accepted

## Context

The MVP needs a PWA, API routes, Twitch OAuth callbacks, Twitch EventSub webhook handling, async processing, durable relational state, short-lived caching, and Web Push delivery. It should not require an always-running backend process.

## Decision

Use Cloudflare's serverless stack for the MVP:

- Cloudflare Pages for the static PWA.
- Cloudflare Workers for API routes, Twitch OAuth callbacks, EventSub webhook receiving, queue consumers, and Web Push sending.
- Cloudflare D1 for durable relational state.
- Cloudflare Queues for async EventSub processing and notification jobs.
- Cloudflare KV only for short-lived cache such as app access tokens.
- Cloudflare Secrets for Twitch secrets, the EventSub webhook secret, token encryption key, and VAPID private key.

Do not use Fastify, local JSON files, in-memory state, `setTimeout` scheduling, or an always-running backend as MVP source-of-truth architecture.

## Consequences

- Runtime code must fit Cloudflare Worker request and queue lifecycles.
- Durable application state belongs in D1, not process memory or local files.
- Any POC backend patterns remain non-MVP unless a new ADR accepts them.
