# Web Source Layout (`apps/web/src/`)

Read this when working inside `apps/web/src` — it's the file map for the React/Vite PWA frontend. Not needed for API-only or docs/spec work.

```
main.tsx                      — React root, QueryClientProvider, BrowserRouter, AuthProvider;
                                registers /service-worker.js (fire-and-forget)
App.tsx                       — route tree (Routes/Route), wraps tabs in AuthGate + AuthenticatedLayout
index.css                     — Tailwind v4 import, theme tokens (CSS custom properties), dark-only theme
context/
  auth-context.tsx            — AuthProvider/useAuth; fetches GET /api/me on mount; user/isLoading/
                                isAuthenticated/refetch/logout
routes/
  authenticated-layout.tsx    — bottom-tab-bar layout wrapping the 3 protected tab routes (<Outlet />)
  login.tsx                   — login screen ("Connect with Twitch" → GET /api/auth/twitch/start)
  channels.tsx, alerts.tsx,   — tab views (T-004); account.tsx also owns the push notification
  account.tsx                   permission/subscription UI (T-005)
components/
  auth-gate.tsx                — AuthGate; single guard for both "authenticated" and "guest" route cases
  bottom-tab-bar.tsx           — persistent 3-tab nav (Channels/Alerts/Account)
  full-screen-loader.tsx       — shared loading state for AuthGate
  ui/                          — shadcn/ui primitives (Button, Sheet, Input, Badge, Avatar); copied source,
                                edit directly, do not treat as an upgradeable dependency
hooks/
  use-session-aware-mutation.ts — useMutation wrapper that marks the session expired on a 401
  use-push-notifications.ts    — push status state machine (checking/unsupported/denied/not-enabled/
                                enabled) + enable/disable flows (T-005, ADR 0027)
  use-channels.ts, use-preferences.ts, use-category-search.ts, use-debounced-value.ts
lib/
  api.ts                       — fetch wrapper (api.get/api.post/api.delete), same-origin via Vite dev proxy
  errors.ts                    — ApiRequestError/ApiErrorBody, matches the API's ADR 0009 error envelope
  push.ts                      — Push API helpers: support detection, SW registration, subscribe,
                                localStorage subscription-id cache, urlBase64ToUint8Array
  utils.ts                     — shadcn's `cn()` helper
types/
  user.ts, push.ts             — mirror apps/api's snake_case fields exactly (not shared/imported
                                across the workspace boundary — see ADR 0028)
public/
  manifest.webmanifest         — static PWA manifest (ADR 0026)
  service-worker.js            — hand-written push/notificationclick-only SW; no fetch handler,
                                no caching (ADR 0026)
```

`@/*` resolves to `apps/web/src/*`. The alias must be declared in **both** `apps/web/tsconfig.json` (root, read by the `shadcn` CLI) and `apps/web/tsconfig.app.json` (read by `tsc`/the editor) — if only one has it, `npx shadcn add <component>` writes files to a literal `./@` directory instead of `src/components/ui/`.
