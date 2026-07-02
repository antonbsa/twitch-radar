# 0023 - Use TanStack Query For Server State

## Status

Accepted

## Context

The Channels tab polls live channel/viewer state, and preference panels create and remove server-backed preferences. This is server state (fetched, cached, invalidated) distinct from local UI state (active tab, sheet open/closed), which React Context is not well suited to manage on its own.

## Decision

Use `@tanstack/react-query` for all server-state data fetching (followed channels, preferences, sync status) introduced from T-004 onward. A single `QueryClient` is provided at the app root in `main.tsx`.

Authentication state remains in a dedicated `AuthContext` (React Context), not TanStack Query, since it gates routing and is read by components that must not suspend on a query cache.

## Consequences

- `GET /api/me` is fetched directly in `AuthContext`, not through a query hook, so `isAuthenticated`/`isLoading` are available synchronously to route guards.
- Feature data (channels, preferences) fetched in T-004+ should use query hooks with explicit query keys, enabling cache invalidation after mutations (e.g. adding a category preference).
- No separate global state library (Redux, Zustand) is introduced; local UI state stays in component state or React Context.
