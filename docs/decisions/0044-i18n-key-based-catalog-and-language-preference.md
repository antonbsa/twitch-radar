# 0044 - I18n Key-Based Catalog And Language Preference

## Status

Accepted

## Context

No i18n infrastructure exists anywhere in the repo (issue #35): all `apps/web/src` UI copy is hardcoded English JSX, and `apps/api/src/services/notifications/match.ts` builds push notification `title`/`body` as literal English sentences (ADR 0034's `buildPayload`).

Issue #35 already resolved the core approach as "Option B": the API emits `keyId`-style identifiers instead of literal text, and the client (React tree) and the service worker (`apps/web/public/service-worker.js`) resolve them to labels based on the user's stored language preference. This was chosen over a client-only library (`react-i18next`/`@lingui`) because such a library doesn't help the service worker — it renders push notifications from whatever the push payload contains (ADR 0026: no `fetch` handler, no bundler-driven code, just a hand-written static script), and can't import a React i18n context. Once notification text has to be resolvable outside React, using the same resolution mechanism for the in-app UI keeps one system instead of two.

This ADR resolves the remaining implementation-level questions the issue deliberately left open: where the language preference is stored, the catalog's file format and location, whether the service worker fetches it at runtime or needs it bundled, and the exact API surface for reading/writing the preference.

## Decision

### Supported languages

`en` (default), `pt-BR`, `es`. Represented as a plain string union `"en" | "pt-BR" | "es"` wherever it appears in code (no separate enum type).

### Storage

`users` gains a `language` column (`text NOT NULL DEFAULT 'en'`, `infra/migrations/0003_i18n_language_preference.sql`), following the existing single-column-addition style of `infra/migrations/0002_t008_token_refresh_failed_at.sql`. Validity (`en`/`pt-BR`/`es`) is enforced at the API layer via zod, not a DB `CHECK` constraint — no other column in this schema uses one. `UsersRepository.upsert` (called on every OAuth login) does not touch `language`, so a returning user's preference survives re-login; only a dedicated update path changes it.

### API surface

- `GET /api/me` already returns the full user row; it now includes `language`.
- `PATCH /api/me/language` (new, `requireAuth`), body `{ language: "en" | "pt-BR" | "es" }` validated by zod, updates the row via a new `UsersRepository.updateLanguage(id, language, now)` and returns the updated user in the existing `{ data: User }` envelope — same shape and status-code conventions as the preference routes in `http/routes/preferences.ts`.

### Catalog format and location

One flat JSON file per language: `apps/web/public/locales/en.json`, `pt-BR.json`, `es.json`. Each maps a dotted string key to a template string using `{paramName}` placeholders (e.g. `"notification.stream_started_in_category.title": "{broadcasterName} is streaming {categoryName}"`).

This lives under `apps/web/public/`, not `apps/web/src/`, and is fetched at runtime by both consumers rather than imported at build time:

- `apps/web/public/` is already the established home for static, unbundled, runtime-fetched assets reachable at a fixed URL — `service-worker.js` and `manifest.webmanifest` (ADR 0026) are the precedent.
- The service worker is a classic (non-module) script with no build step (ADR 0026) and cannot `import` from `apps/web/src`. A build-time-bundled catalog would need either a second build entry for the service worker or a bundler-specific trick to import a `public/` asset as a module — both rejected there for the same "no build step for the service worker" reasoning ADR 0026 already applied.
- Fetching the same URL (`/locales/<lang>.json`) from both the React app and the service worker means there is exactly one physical copy of the catalog data — no duplication, no drift between "what the UI shows" and "what a notification says" for a given key.

The small amount of logic needed to _use_ the catalog (a `{param}` interpolation helper, catalog fetch-with-fallback-to-`en`) is not shared code — it's duplicated in `apps/web/src/lib/i18n.ts` (React side) and inline in `apps/web/public/service-worker.js` (service-worker side), a handful of lines each. This mirrors ADR 0028's reasoning for mirroring wire-shape types across the same kind of boundary (no build-time import possible) rather than introducing a shared package for something this small.

### Web-side resolution

`apps/web/src/context/language-context.tsx` provides a `LanguageProvider`:

- Resolves the initial language before any authenticated user is known (login page, initial load) from `localStorage["language"]` if set and valid, else a best-effort prefix match against `navigator.language`, else `en` — the same "localStorage as the source of truth for a client-only preference until the server one is known" idiom `lib/push.ts` already uses for the cached push-subscription id.
- Fetches `/locales/<lang>.json` on mount and on every language change, caching the parsed catalog per language in a module-level `Map` so switching back to a previously-loaded language is instant.
- Exposes `t(key, params?)`, which looks up the key in the loaded catalog, interpolates `params`, and falls back to the raw key string if the catalog or the key is missing (never throws, never blanks the UI).
- Exposes `setLanguage(language)` (user-initiated: persists to `localStorage`, swaps the catalog, and — when authenticated — calls `PATCH /api/me/language`) and `adoptLanguage(language)` (reconciles from the authoritative server value once `/api/me` resolves, without re-triggering a `PATCH`).
- `main.tsx` wraps `AuthProvider`/`App` in `LanguageProvider`; a small effect inside the authenticated tree calls `adoptLanguage(user.language)` whenever the authenticated user's stored preference is loaded, so a returning user's server-side preference wins over whatever `localStorage` guessed before `/api/me` resolved.

The Account page gains a language selector (en / pt-BR / es) calling `setLanguage`.

### Service-worker-side resolution

The API embeds the resolved language directly in the push payload rather than having the service worker look it up — the service worker has no session/cookie context to call an authenticated endpoint from, and the API already has the recipient's `language` in hand at send time. The `push` handler in `service-worker.js`:

1. Parses the JSON payload (already handled today).
2. If it carries `titleKey`/`bodyKey`, fetches `/locales/<payload.lang>.json` (falling back to `/locales/en.json` on a fetch/parse failure or an unrecognized language), and resolves both keys through the same `{param}` interpolation used on the web side.
3. Falls back further to the existing hardcoded English strings (`"Twitch Radar"` / `"A channel you follow has an update."`) if the catalog fetch fails outright or a key is missing — the same last-resort behavior the handler already has for a malformed/non-JSON payload, now also covering "catalog unreachable."

### API notification payload contract

`NotificationPayload` (`apps/api/src/types.ts`) changes from `{ title, body, url }` to:

```ts
export interface NotificationPayload {
  titleKey: string
  bodyKey: string
  params: Record<string, string>
  lang: string
  url: string
}
```

`services/notifications/match.ts` emits `titleKey`/`bodyKey` as `` `notification.${trigger}.title` `` / `` `notification.${trigger}.body` ``, reusing the existing `NotificationTriggerType` values (`stream_started_in_category`, `switched_into_category`) as the key namespace — no separate key-name enum to keep in sync. `params` carries `{ broadcasterName, categoryName }`.

Because `lang` is per-recipient, the payload can no longer be built once per change event and reused for every matched user (as `buildPayload` did before) — it's now built per user inside the delivery loop, using a language lookup batch-loaded for the whole matched-user set via a new `UsersRepository.findLanguagesByIds` (batched at 100 per the D1 bound-parameter limit, same idiom as the repo's other batched `inArray` lookups). `services/notifications/deliver.ts` needs no changes — it already serializes `message.payload` opaquely.

Fallback values that were previously baked-in English sentences (`"A channel you follow"` for an unnamed broadcaster, `"a category you follow"` for an unnamed category) are replaced with the raw broadcaster/category id as the `params` value instead of English prose, since a param value flows into every language's template verbatim and can't itself be localized. This is a minor behavior change on an edge case that in practice shouldn't occur (both names are expected to be populated from Twitch data whenever a trigger fires).

## Consequences

- Adding a UI string or a notification message means adding one key to all three `apps/web/public/locales/*.json` files — a missing key degrades to showing the raw key (UI) or the hardcoded English fallback (notification), never a crash.
- The API stays language-agnostic: it never imports or embeds translated text, only semantic keys, params, and the recipient's language tag.
- The service worker's push handler goes from synchronous to `async` (an extra `fetch` before `showNotification`), adding one network round-trip to notification display latency — accepted at MVP; caching the fetched catalog in the Cache Storage API is a follow-up if this proves slow in practice.
- A user's language preference change is immediate in the current tab (optimistic local catalog swap) and applies to all _subsequently sent_ push notifications once the `PATCH` lands; a notification already in flight when the change happens uses whatever `lang` was resolved at send time.
- `apps/web/src/types/user.ts` and `apps/api/src/types.ts`'s `User` mirror each other's new `language` field, per ADR 0028.
