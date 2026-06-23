# 0010 - Keep The POC Separate From The MVP Architecture

## Status

Accepted

## Context

The original proof of concept proved browser Web Push behavior with a local Fastify process, local JSON files, static channel fixtures, and timer-based notification scheduling. The MVP has different platform and state requirements.

## Decision

Treat the POC as historical validation for browser/Web Push behavior only.

Do not extend the POC architecture for MVP work unless a future ADR explicitly accepts that change.

Keep MVP source-of-truth work in the Cloudflare architecture described by the accepted ADRs.

## Consequences

- `src`, `public`, `data`, and POC docs are historical unless a task explicitly targets them.
- MVP implementation should not introduce local JSON storage, process memory, Fastify routing, or timer scheduling as durable product behavior.
- Web Push mechanics proven by the POC can be reused where they fit the Cloudflare Worker runtime.
