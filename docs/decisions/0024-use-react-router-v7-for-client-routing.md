# 0024 - Use React Router v7 For Client Routing

## Status

Accepted

## Context

The UI reference defines a small, fixed route tree: `/login` (unauthenticated only) and three protected tabs (`/channels`, `/alerts`, `/account`) sharing a persistent bottom tab bar. Routing needs to compose with the `AuthContext` from ADR 0023 to redirect based on session state, without requiring server-side rendering or route loaders tied to a specific server runtime.

## Decision

Use React Router v7 in declarative mode (`<BrowserRouter>` + `<Routes>`/`<Route>`, no framework/data-router file-based routing) via the `react-router` package.

Route composition:

- `/` redirects to `/channels`, which resolves to `/login` for unauthenticated sessions via nested guards.
- `LoginRoute` wraps `/login` and redirects to `/channels` if already authenticated.
- `ProtectedRoute` wraps a shared `AppShell` layout route (bottom tab bar + `<Outlet />`) containing `/channels`, `/alerts`, `/account`.

Both guards read `isLoading`/`isAuthenticated` from `AuthContext` and render a full-screen loader until the initial `GET /api/me` resolves, avoiding a flash-redirect.

## Consequences

- No server-side rendering or route loaders/actions are used; all data fetching happens in components/hooks.
- Adding a new protected tab means adding a `<Route>` under the existing `ProtectedRoute`/`AppShell` pair, not a new guard.
- Pinned to the v7 line specifically (not v8, the current latest major) to match the accepted task scope in `specs/mvp/tasks/t-003-frontend-scaffold.md`; revisit only via a new ADR.
