# 0037 - Single `PUBLIC_URL`, Same-Origin API And Web In Every Environment

## Status

Accepted

## Context

Mobile-device testing (tunneling the dev server, see the README's "Testing On Mobile" section) surfaced two auth bugs at once: the OAuth callback redirected the browser to the API Worker's own bare JSON root instead of the frontend, and Safari drops a `Set-Cookie` combined with a `Location` redirect on the same response (WebKit bug 188165). Fixing the first required introducing a `WEB_URL` var distinct from the existing `API_URL`, since ADR 0003 splits `apps/api` (Cloudflare Worker) and `apps/web` (Cloudflare Pages) into separate deployment targets.

Once both vars existed, they needed to be kept in sync by hand everywhere (`.env.local`, the `dev:mobile` tunnel script) — exactly the kind of two-source-of-truth footgun that caused a stale-value bug mid-session (a restarted tunnel updated one var but not the other). That prompted the question this ADR answers: do API and web ever actually need different origins?

Nothing in the session-cookie design (ADR 0016) accounts for cross-origin use — the cookie has no `Domain` attribute and is `SameSite=Lax`, and `apps/web`'s API client (`lib/api.ts`) calls relative `/api/*` paths with no CORS middleware anywhere in `apps/api`. That combination only ever works if the browser sees API and web as the same origin. ADR 0003's "separate deployment targets" describes build/deploy pipelines (a Worker project and a Pages project), not necessarily separate domains — Cloudflare supports mapping a Worker route (e.g. `example.com/api/*`) onto the same custom domain a Pages project serves, making them one origin from the browser's perspective without touching the auth design at all.

## Decision

API and web are **same-origin in every environment** — local dev, the `dev:mobile` tunnel, staging, and production. Concretely:

- Production/staging: a Worker route (`<domain>/api/*`) shares the same custom domain as the Pages deployment; no separate `api.<domain>` subdomain.
- Local dev: the Twitch redirect URI is registered on Vite's origin (`http://localhost:5173/api/auth/twitch/callback`), not the Worker's raw port (`:8787`) directly — Vite's proxy forwards `/api/*` for both `fetch()` calls and full top-level browser navigations, so this works for the OAuth round-trip too, not just AJAX.
- `dev:mobile`'s tunnel fronts Vite for the same reason, so the tunnel URL already served both roles even before this ADR.

Collapse `API_URL`/`WEB_URL` into a single `PUBLIC_URL` env var (`apps/api/src/env.ts`), used for:

1. Building `twitchRedirectUri` (OAuth start).
2. The post-login redirect target (OAuth callback).
3. The EventSub webhook callback URL stamped on subscriptions (`services/monitoring.ts`).

## Consequences

- One env var to update per environment instead of two kept manually in sync — removes the class of bug that motivated this ADR.
- Session cookies, CORS, and `credentials: "include"` remain entirely unaddressed — this ADR is what makes that acceptable, not a workaround pending real cross-origin support. If a future requirement forces API and web onto genuinely different domains, this decision needs revisiting alongside the cookie design (ADR 0016) and the frontend's API client, not just an env var split.
- `apps/api/wrangler.jsonc` needs a Worker route added under the production domain once a deploy pipeline exists (none does yet — only `linting.yaml`/`tests.yaml` run in CI).
- Server-to-server or script-only callers that don't care about being browser-reachable (e.g. `mock-eventsub.mjs`) still work by hitting `PUBLIC_URL` directly — in dev that's Vite, which proxies through to the Worker like any other `/api/*` request.
