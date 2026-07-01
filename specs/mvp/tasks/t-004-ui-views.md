# T-004: UI Views

## Goal

Implement the Channels, Alerts, and Account views with full interactive behavior, consuming the API surface defined in prior tasks.

## UI Reference

[../02. ui-layout.md](../02.%20ui-layout.md)

## Spec Work

Define or confirm:

- Channel row data mapping from `GET /api/channels/followed` response shape.
- Live duration computation: derive from `startedAt` at render time, formatted as `Xh Ym`.
- Viewer count formatting: `42K`, `1.2M`.
- Per-channel preference panel: bottom sheet dismiss behavior (swipe down, tap outside).
- Category search: debounce delay and minimum character threshold before firing.
- Loading skeleton approach (per-row vs. full-screen).
- Empty and error states for each view.
- Sync button UX: optimistic disable during in-flight request, success/error feedback.
- Account view notification section: display-only stub (push permission creation implemented in T-005).
- Reconnect prompt: trigger condition (401 mid-session vs. initial load failure).

## Implementation Scope

### Channels View (`/channels`)

- Fetch followed channels with TanStack Query (`GET /api/channels/followed`).
- Render live section and offline section as defined in the UI layout reference.
- Live channel row:
  - Circular avatar with live indicator.
  - Display name.
  - Category name and formatted viewer count.
  - Live duration computed from `startedAt` (updated on re-render).
  - Config button → opens per-channel preference panel.
- Offline channel row:
  - Circular avatar (no indicator).
  - Display name.
  - "Offline" label.
  - Config button.
- Per-channel preference panel (bottom sheet):
  - Channel name header.
  - Debounced category search input (`GET /api/categories/search?q=...`).
  - Search result list — tap to add (`POST /api/preferences/channel`).
  - Saved preferences list — each removable (`DELETE /api/preferences/channel/:id`).
  - Dismiss on swipe down or outside tap.
- Manual sync button (`POST /api/sync/follows` → invalidate followed channels query).
- Loading skeleton while fetching.
- Empty state: no followed channels.
- Error state: failed fetch.

### Alerts View (`/alerts`)

- Fetch global preferences with TanStack Query (`GET /api/preferences`).
- Saved global category list with remove button per row (`DELETE /api/preferences/global/:id`).
- "Add Category" button → opens category search bottom sheet:
  - Debounced search input (`GET /api/categories/search?q=...`).
  - Tap result → `POST /api/preferences/global` + invalidate preferences query.
- Empty state: "No global alerts set."
- Error state: failed fetch.

### Account View (`/account`)

- Connected account card: Twitch avatar + display name (from auth context `GET /api/me`).
- Notification permission section (display stub — push implementation in T-005):
  - Read `Notification.permission` and display state: `granted`, `default`, or `denied`.
  - "Enable Notifications" button (visible if `default`).
  - "Go to browser settings to enable" note (visible if `denied`).
  - No actual push subscription creation here.
- Reconnect prompt: rendered when `isAuthenticated` is `false` after the initial session check or after a mid-session 401. Shows a "Reconnect Twitch" button → `GET /api/auth/twitch/start`.
- "Sync Channels" button: `POST /api/sync/follows`.
- "Log Out" button: `POST /api/auth/logout` → clears auth context → redirect to `/login`.

## Acceptance Criteria

- Channel list renders live channels first (viewer count desc), offline below (display name asc).
- Each live channel row shows avatar, live indicator, display name, category, formatted viewer count, and live duration.
- Config button opens the per-channel preference panel.
- Category search returns results and adding a preference persists it.
- Per-channel preferences can be removed from the panel.
- Alerts tab lists saved global preferences.
- Global category can be searched, added, and removed.
- Account tab shows connected Twitch avatar and display name.
- Log out navigates user to `/login`.
- Reconnect prompt appears when session is invalid.
- Notification permission status is displayed correctly for all three `Notification.permission` states.
- All views render loading skeletons and error states.
- Mobile layout matches the UI layout reference on a narrow viewport.
- Push subscription creation is deferred to T-005; the "Enable Notifications" button is present but wired to a stub or left inert.

## Completion Validation

- Channel list renders correctly against real or mocked `GET /api/channels/followed`.
- Live duration displays and increments on re-render.
- Per-channel preference add/remove API calls succeed and UI updates.
- Global preference add/remove API calls succeed and UI updates.
- Logout flow returns user to login screen and clears auth context.
- Manual check on a mobile viewport confirms layout matches the UI layout reference.

## Dependencies

- T-003 Frontend Scaffold.
