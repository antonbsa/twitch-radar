# Web Source Layout (`apps/web/src/`)

Read this when working inside `apps/web/src` — it's the file map for the React/Vite PWA frontend. Not needed for API-only or docs/spec work.

```
main.tsx                      — React root, QueryClientProvider, BrowserRouter, LanguageProvider,
                                AuthProvider; registers /service-worker.js (fire-and-forget)
App.tsx                       — route tree (Routes/Route), wraps tabs in AuthGate + AuthenticatedLayout;
                                useSyncLanguageWithUser reconciles the language context from the
                                authenticated user's stored preference (ADR 0044)
index.css                     — Tailwind v4 import, theme tokens (CSS custom properties), dark-only theme
context/
  auth-context.tsx            — AuthProvider/useAuth; fetches GET /api/me on mount; user/isLoading/
                                isAuthenticated/refetch/logout
  language-context.tsx        — LanguageProvider/useLanguage; t()/setLanguage()/adoptLanguage();
                                fetches public/locales/<lang>.json, PATCHes /me/language on a
                                user-initiated change (ADR 0044)
routes/
  authenticated-layout.tsx    — bottom-tab-bar layout wrapping the 3 protected tab routes (<Outlet />)
  login.tsx                   — login screen ("Connect with Twitch" → GET /api/auth/twitch/start)
  channels.tsx, alerts.tsx,   — tab views (T-004); account.tsx also owns the push notification
  account.tsx                   permission/subscription UI (T-005)
components/
  category-chip.tsx            — removable category chip; click-to-arm/click-to-confirm removal
                                 (auto-resets), optional Globe marker for a per-channel preference an
                                 active global preference also covers
  add-category-chip.tsx        — dashed "+" chip appended to the end of a category list, styled like
                                 the chips around it rather than as a separate header control
  global-alerts-card.tsx       — "All channels" card: global preferences as chips plus its add-chip
  channel-alerts-card.tsx      — one channel's alert card: avatar/name/live dot, its category chips,
                                 its add-chip, and the "Also in All channels" legend
  auth-gate.tsx                — AuthGate; single guard for both "authenticated" and "guest" route cases
  bottom-tab-bar.tsx           — persistent 3-tab nav (Channels/Alerts/Account)
  full-screen-loader.tsx       — shared loading state for AuthGate
  add-channel-sheet.tsx        — channel picker that hands off to channel-preferences-sheet, for
                                 configuring a channel with no preferences yet
  language-selector.tsx        — Account page's language picker (en / pt-BR / es), built on ui/select.tsx
                                (ADR 0044)
  ui/                          — shadcn/ui primitives (Button, Sheet, Input, Badge, Avatar, Select); copied
                                source, edit directly, do not treat as an upgradeable dependency
hooks/
  use-session-aware-mutation.ts — useMutation wrapper that marks the session expired on a 401
  use-push-notifications.ts    — push status state machine (checking/unsupported/denied/not-enabled/
                                enabled) + enable/disable flows (T-005, ADR 0027)
  use-channels.ts, use-preferences.ts, use-category-search.ts, use-debounced-value.ts
lib/
  api.ts                       — fetch wrapper (api.get/api.post/api.patch/api.delete), same-origin
                                via Vite dev proxy
  errors.ts                    — ApiRequestError/ApiErrorBody, matches the API's ADR 0009 error envelope
  alert-groups.ts              — pure grouping/ordering of per-channel preferences into one entry
                                 per broadcaster, flagging categories an active global also covers
  push.ts                      — Push API helpers: support detection, SW registration, subscribe,
                                localStorage subscription-id cache, urlBase64ToUint8Array
  i18n.ts                      — SUPPORTED_LANGUAGES/Language, resolveInitialLanguage (localStorage
                                → navigator.language → default), interpolate, loadCatalog (fetches
                                and caches public/locales/<lang>.json); logic duplicated, not shared,
                                in public/service-worker.js (ADR 0044)
  utils.ts                     — shadcn's `cn()` helper
types/
  user.ts, push.ts             — mirror apps/api's snake_case fields exactly (not shared/imported
                                across the workspace boundary — see ADR 0028); user.ts's `language`
                                field mirrors apps/api's Language (ADR 0044)
public/
  manifest.webmanifest         — static PWA manifest (ADR 0026)
  service-worker.js            — hand-written push/notificationclick-only SW; no fetch handler for
                                app requests, no caching (ADR 0026); push handler fetches
                                /locales/<lang>.json to resolve {titleKey, bodyKey, params, lang}
                                payloads into displayed text (ADR 0044)
  locales/
    en.json, pt-BR.json,
    es.json                    — the one shared key→string catalog, fetched at runtime by both this
                                app and the service worker (ADR 0044)
```

`@/*` resolves to `apps/web/src/*`. The alias must be declared in **both** `apps/web/tsconfig.json` (root, read by the `shadcn` CLI) and `apps/web/tsconfig.app.json` (read by `tsc`/the editor) — if only one has it, `npx shadcn add <component>` writes files to a literal `./@` directory instead of `src/components/ui/`.
