---
status: Accepted
area: testing
amends: ["0028"]
---

# 0067 - Validate API Responses Against Zod Contracts

## Status

Accepted. Complements [ADR 0028](0028-mirror-wire-shape-types-across-workspaces.md): the web mirrors stay hand-written, but a type-level test now verifies them.

## Context

Requests are validated with zod, but responses are built ad hoc in each handler, so a missing, extra or mistyped field passes every test tier and typecheck. The drift already existed: `PATCH /me/notifications-paused` and `PATCH /me/language` omitted `twitch_reconnect_required` while the web typed their responses as `{ data: User }`. ADR 0028 says to revisit the mirroring decision when drift causes a bug; this is the early warning.

## Decision

- **Every JSON response is a zod schema in `apps/api/src/contracts/`**, one file per feature. Objects are `.strict()`, so a leaked column fails as loudly as a missing field. `ErrorEnvelope` is the single definition of the shape in [ADR 0009](0009-use-consistent-json-api-error-shape.md).
- **Handlers enforce the contract at compile time** with `satisfies <Contract>`; production code never parses its own responses.
- **The API test tier enforces what the Worker actually sends** through `expectConforms` / `expectApiError` (`tests/api/setup/contract.ts`), which check status, content type and the full body. Tests no longer cast bodies with `as { ... }`.
- **Web mirrors are checked, not generated.** A type-level test under `tests/contracts/` asserts each mirrored web type equals its inferred contract; `tests/` is bundled into neither app, so ADR 0028's isolation holds. `npm run typecheck` also runs `tsc -p tests`.
- **`PATCH /me/*` return the full user**, the same `UserDto` as `GET /me`, so a caller can feed `res.data` into the user cache.

## Alternatives considered

- **A shared types package.** Rejected, as in ADR 0028: it would blur the Worker/browser isolation.
- **Runtime `parse` of responses in production.** Rejected: it costs CPU per request for something `satisfies` and the test tier already catch.
- **OpenAPI generation and fuzzing, or Pact.** Out of scope: the first changes how routes are declared ([ADR 0014](0014-use-hono-for-worker-api-routing.md)) and can build on these schemas later; the second has no independent consumer to protect.

## Consequences

- A new route response needs a contract, and a handler change that drops or adds a field fails typecheck or the API tier.
- Rollout is incremental: foundation and `/me` first, then the remaining routes, then a coverage guard that compares contracts with the routes.
