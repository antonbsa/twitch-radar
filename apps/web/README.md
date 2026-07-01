# Twitch Radar Web

React + Vite frontend for the MVP PWA, deployed as a Cloudflare Pages project.

## Scripts

- `npm run dev` — start the Vite dev server (proxies `/api/*` to the local Worker on port 8787).
- `npm run build` — typecheck and produce static output in `dist/`.
- `npm run preview` — preview the production build locally.
- `npm run typecheck` — TypeScript project check, no emit.

## Related decisions

- [ADR 0003](../../docs/decisions/0003-split-mvp-into-api-web-and-infra-roots.md) — app root layout
- [ADR 0010](../../docs/decisions/0010-keep-poc-separate-from-mvp-architecture.md) — POC boundary
- [ADR 0012](../../docs/decisions/0012-use-npm-workspaces-for-app-packages.md) — workspace setup
- [ADR 0020](../../docs/decisions/0020-use-react-and-vite-for-web-frontend.md) — React + Vite
- [ADR 0021](../../docs/decisions/0021-use-tailwind-css-for-styling.md) — Tailwind CSS
- [ADR 0022](../../docs/decisions/0022-use-shadcn-ui-for-component-primitives.md) — shadcn/ui
- [ADR 0023](../../docs/decisions/0023-use-tanstack-query-for-server-state.md) — TanStack Query
- [ADR 0024](../../docs/decisions/0024-use-react-router-v7-for-client-routing.md) — React Router v7

UI reference: [`specs/mvp/02. ui-layout.md`](../../specs/mvp/02.%20ui-layout.md)
