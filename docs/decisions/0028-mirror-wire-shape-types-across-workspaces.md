# 0028 - Mirror Wire-Shape Types Across Workspaces Instead Of A Shared Package

## Status

Accepted

## Context

`apps/api` and `apps/web` are separate npm workspaces, each owning its own `package.json` and dependencies ([ADR 0012](0012-use-npm-workspaces-for-app-packages.md)). Several types describe the exact JSON shape one side sends and the other parses — `User` (`apps/api/src/types.ts` / `apps/web/src/types/user.ts`, T-003/T-004) and `PushSubscriptionRecord` (`apps/api/src/types.ts` / `apps/web/src/types/push.ts`, T-005) — and are currently hand-copied on both sides with matching snake_case fields.

Code comments and `AGENTS.md` cited "ADR 0012" as the reason these aren't a shared, imported type. That citation was wrong: ADR 0012 only decided the workspace/package split, it never addressed whether types should be shared across that split. This ADR is the actual decision that was missing.

## Decision

Keep manually mirroring these response DTOs as separate interfaces per workspace rather than introducing a shared package (e.g. `packages/shared-types`):

- The set is small (two DTOs today) and flat — plain data shapes with no logic, not worth a build/type-check-wired workspace to share.
- Both sides are edited in the same commit by the same person when a shape changes (single-dev MVP, no cross-team coordination cost that duplication would otherwise protect against).
- A shared package would need either its own package root and TS project wiring, or `apps/web`'s bundler reaching into `apps/api/src` directly — both undermine the isolation ADR 0012 established (each app owns its own dependencies; the Worker's server-only packages must never leak into the browser bundle).
- Keeping the same type name on both sides (`User`/`User`, `PushSubscriptionRecord`/`PushSubscriptionRecord`) is intentional, not accidental drift: it signals "this is the same wire shape," and a mismatched name would suggest they're allowed to diverge when they aren't.

## Consequences

- Any new API response DTO that the web app also needs to parse gets a matching mirrored interface under `apps/web/src/types/`, same field names and same type name as the API side.
- Comments/docs that cited ADR 0012 for this duplication (`apps/web/src/types/push.ts`, `AGENTS.md`'s env vars section) are corrected to cite this ADR instead.
- If the number of mirrored DTOs grows significantly, or manual drift actually causes a bug (fields renamed on one side and missed on the other), revisit and introduce a shared package at that point — this decision is a "not yet," not a permanent rule.
