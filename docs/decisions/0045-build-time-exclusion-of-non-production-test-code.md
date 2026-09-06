# 0045 - Build-Time Exclusion Of Non-Production Test/Dev Code

## Status

Accepted

## Context

[ADR 0025](0025-e2e-ui-tests-with-playwright-and-test-seam.md) registers the test-seam routes (`/api/__test__/*`) on the Hono router only when `parseEnv(env).environment !== "production"`. That ADR's own Consequences section already flagged the gap this closes: "Registering the test-seam routes conditionally is a runtime decision, not build-time dead-code elimination — the route handlers remain present in the worker bundle regardless of deploy target ... There is currently no separate deployed 'preview' environment reachable over the network; if one is introduced later, revisit whether environment-gating alone is still sufficient."

A deployed, network-reachable `preview` environment now exists (`apps/api/wrangler.jsonc`'s `env.preview`, `https://twitch-radar-preview.antonbsa.workers.dev`), with `ENVIRONMENT: "preview"` — satisfying `!== "production"`. The seam's `/seed` route accepts an arbitrary `userId` and forges a valid session for it with no token check, because until now nothing reachable over the network has run with that gate open.

A sandbox feature is being added (see [ADR 0046](0046-sandbox-personas-for-dev-and-preview.md)) that also needs to be reachable in preview but absent from production, extending this same problem to a second, larger surface (an in-worker fake Twitch Helix implementation and fixture data, not just a handful of route handlers). Building a second bespoke gating mechanism for it, on top of the one already flagged as insufficient, would leave the repo with two different answers to the same question of "how does test/dev-only code stay out of production."

Wrangler (v4.125, confirmed via `node_modules/wrangler/config-schema.json`, `RawEnvironment.define`) supports per-environment `define` values, which `wrangler dev`/`deploy` substitute at build time via esbuild — a `define`d boolean literal in an `if` condition lets esbuild eliminate the dead branch entirely rather than leaving it reachable at runtime.

## Decision

Test/dev-only code (the existing test seam and the new sandbox) is excluded from the production bundle at build time, not gated at request time:

1. Add a `define`d compile-time constant (e.g. `__NON_PRODUCTION_FEATURES__`) set per environment in `apps/api/wrangler.jsonc`: `false` under `env.production`, `true` at the top level (covering local dev) and under `env.preview`.
2. Route registration and any module-level import of test/sandbox code is guarded by `if (__NON_PRODUCTION_FEATURES__)` so esbuild's dead-code elimination drops the entire branch — including its imports — when building for production. The existing test-seam routes (`src/http/routes/_tests.ts`) move onto this mechanism as part of this change, replacing the `environment !== "production"` runtime check described in ADR 0025.
3. This is a build-time property, not a request-time one: there is no per-request check to bypass, because the code is not present in the production artifact to be reached at all — matching the intent ADR 0025 already stated for the seam, now actually load-bearing given preview is deployed.
4. This ADR does not by itself decide whether the sandbox additionally needs a request-time credential (that's [ADR 0046](0046-sandbox-personas-for-dev-and-preview.md)'s concern) — build-time exclusion answers "is this code reachable in production," not "who can reach it in the environments where it does exist."

## Rejected alternatives

- **Add a shared-secret token check to the existing runtime gate, keep it runtime-only.** Rejected as the immediate fix ADR 0025 anticipated, but it only narrows who can reach code that still ships in the production bundle — the actual gap identified (preview now being a live, network-reachable, non-production deploy) is answered more completely by not shipping the code at all in production, which a request-time check alone can't do.
- **Leave the existing seam on its current runtime gate and only build the new sandbox with build-time exclusion.** Rejected — it leaves two different mechanisms answering the same question in the same file (`index.ts`), which is more confusing than either mechanism alone and gives no reason to trust the older one is still sufficient now that its own stated precondition (no deployed preview) has changed.

## Consequences

- `apps/api/src/index.ts`'s `buildApp(includeTestSeam: boolean)` parameter and its call site (`parseEnv(env).environment !== "production"`) are replaced by a direct `if (__NON_PRODUCTION_FEATURES__)` branch around test-seam route registration.
- A TypeScript ambient declaration for `__NON_PRODUCTION_FEATURES__` is needed (e.g. in `apps/api/src/types.ts` or a dedicated `globals.d.ts`) so the constant type-checks; `wrangler dev`/`deploy`'s `define` substitution supplies the value at build time.
- Any local `wrangler dev` invocation not going through `apps/api/wrangler.jsonc`'s configured environments (there are none today — both `infra/scripts/dev/api-dev.mjs` and both test tiers' `global-setup.ts` invoke plain `wrangler dev` against the top-level config) needs the top-level `define` to default to `true`, which is what point 1 above specifies.
- Future test/dev-only code additions have one documented answer for "how do I keep this out of production" — guard it with `__NON_PRODUCTION_FEATURES__`, not a new bespoke env check.
