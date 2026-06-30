# T-003: Frontend Scaffold

## Goal

Replace the vanilla JS `apps/web` with a React + Vite application. Establish project structure, routing, auth guard, design system baseline, and the authenticated app shell with bottom tab navigation.

## Decision References

- [ADR 0003: API, web, and infrastructure roots](../../../docs/decisions/0003-split-mvp-into-api-web-and-infra-roots.md)

> Tech stack decisions (React, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router v7) must be documented as ADRs per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md) before or during implementation.

## UI Reference

[../02. ui-layout.md](../02.%20ui-layout.md)

## Spec Work

Define or confirm:

- React + Vite project structure under `apps/web`.
- TypeScript config and path aliases.
- Tailwind CSS configuration and base theme.
- shadcn/ui component subset to install at scaffold time.
- React Router v7 route tree (login, channels, alerts, account).
- Auth context shape: `user`, `isLoading`, `isAuthenticated`, `refetch`.
- `ProtectedRoute` redirect behavior (unauthenticated → `/login`).
- `LoginRoute` redirect behavior (authenticated → `/channels`).
- Bottom tab bar component API.
- Vite dev proxy configuration for local API requests.
- Build output compatibility with Cloudflare Pages.
- Service worker entry point preservation strategy (service worker implementation moved to T-005).

## Implementation Scope

- Replace `apps/web` vanilla JS with a Vite + React + TypeScript project.
- Configure Tailwind CSS.
- Configure shadcn/ui base components: `Button`, `Sheet`, `Input`, `Badge`, `Avatar`.
- React Router v7 route tree:
  - `/` → redirect to `/channels` if authenticated, `/login` if not.
  - `/login` → login screen (unauthenticated only; redirect to `/channels` if already authenticated).
  - `/channels` → Channels tab (protected).
  - `/alerts` → Alerts tab (protected).
  - `/account` → Account tab (protected).
- `AuthContext`:
  - Fetches `GET /api/me` on mount.
  - Exposes `user`, `isLoading`, `isAuthenticated`, `refetch`.
  - Handles `401` by setting `isAuthenticated: false`.
- `ProtectedRoute` component: renders children if authenticated; redirects to `/login` if not.
- Login screen: app branding + "Connect with Twitch" button → `GET /api/auth/twitch/start`.
- Authenticated app shell: bottom tab bar (Channels, Alerts, Account) with `<Outlet />`.
  - Active tab indicated visually.
- Tab stub components (placeholder views — implemented in T-004).
- Vite dev server proxy: `/api/*` → local Wrangler Worker port.
- `package.json` scripts: `dev`, `build`, `preview`, `typecheck`.
- Remove or archive POC files (`app.js`, `styles.css`, `service-worker.js`) so no POC code remains as an active entry point.

## Acceptance Criteria

- `npm run dev` starts the Vite dev server without errors.
- TypeScript compiles without errors (`npm run typecheck`).
- Tailwind CSS base styles and shadcn/ui theme load correctly.
- Unauthenticated request to any protected route redirects to `/login`.
- Authenticated user at `/login` redirects to `/channels`.
- Login screen renders with a working "Connect with Twitch" button.
- Authenticated user sees the bottom tab bar and can navigate between all three tab routes.
- Active tab is visually distinguished from inactive tabs.
- Auth context reflects `isAuthenticated: true` for a valid session and `false` for a `401`.
- `npm run build` produces static output compatible with Cloudflare Pages deployment.
- No POC vanilla JS files remain as active entry points.

## Completion Validation

- Dev server starts and login screen renders for a session without `GET /api/me` returning a valid user.
- Mocked or real authenticated session shows the 3-tab shell.
- Navigating a protected route while unauthenticated redirects to `/login`.
- TypeScript type check passes.
- Build output is verified against Cloudflare Pages requirements.

## Dependencies

- T-001 App Foundation.
- T-002 Twitch Auth And Sync.
