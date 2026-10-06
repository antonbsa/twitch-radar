# apps/web

Frontend conventions for the React/Vite PWA (Tailwind v4, shadcn/ui, TanStack Query, React Router v7).

## Internationalization (ADR 0044)

- All user-visible text goes through the i18n catalog: never a hardcoded string in JSX, a `placeholder`/`aria-label`/`title` attribute, or a toast/error message shown to the user.
- Add a key to `public/locales/en.json` and resolve it with `useLanguage().t()`; use `interpolateNodes` from `lib/i18n-react.tsx` when the text embeds JSX (e.g. a bolded name).
- `en.json`, `es.json` and `pt-BR.json` stay in lockstep. A key missing from the other two is a silent bug (the string falls back to the raw key or the `en` text), not a partial rollout.
- The service worker (`public/service-worker.js`) and the backend (`NotificationJobMessage`'s `{titleKey, bodyKey, params, lang}`) also pass catalog keys, not literal text. A hook or handler that resolves user-facing text returns a key for its caller to look up, unless it is the one place actually rendering it.

## Component placement

- A component used by one page lives in `src/routes/<page>/components/`; `routes/<page>/index.tsx` is the page itself. Page-only hooks and helpers sit beside `index.tsx`.
- `src/components/` holds only what two or more pages (or the app shell) import, plus `ui/`. A page-only component left there, or dropped next to `index.tsx`, passes typecheck and lint, so check importers before placing one: `grep -rn "/<name>\"" apps/web/src`.
- Shared components with a clear theme are grouped: `components/shell/` (auth gate, tab bar, loader: app shell, never imported by a page) and `components/categories/` (category chips and search list). The rest stay flat.
- When a second page starts importing a page-local component, move it to `src/components/` in the same change.

## Buttons and cursor

Tailwind v4's Preflight doesn't give `<button>` a pointer cursor, so `src/index.css` restores it globally in `@layer base` for every enabled `button` and `[role="button"]`.

- A `<button>`, a `Button`, or a `Badge asChild` wrapping a `<button>` gets its cursor from that rule.
- Add `cursor-pointer` only on a clickable non-button (a row `div` with `onClick`, a Radix `option`/`menuitem`).
- `disabled:cursor-not-allowed` still wins, since utilities outrank the base layer.

## Data and state

- Every API-backed read/write goes through a hook in `hooks/` built on `useQuery`/`useSessionAwareMutation`, never a raw `fetch` in a component. Mutations invalidate the relevant query key on success (see `hooks/use-preferences.ts`).
- `useSessionAwareMutation` is what marks a session expired on a 401; don't write a separate 401 handler.
- A user-triggered mutation reports failure through `showMutationErrorToast` (`lib/error-toast.ts`), which stays silent on a 401 so the reconnect flow is the only feedback. Attach toasts at the user action's `mutate()` call site when the same mutation also runs automatically (e.g. follow sync on load/resume), so background runs stay silent.
- API calls go through `lib/api.ts`'s `api.get/post/delete` wrapper (same-origin via the Vite dev proxy). Errors are typed with `ApiRequestError`/`ApiErrorBody` from `lib/errors.ts`, matching the API's error envelope (ADR 0009).
- `types/*.ts` mirror `apps/api`'s snake_case wire shapes by hand instead of importing across the workspace boundary (ADR 0028). When a response shape changes, update the mirrored type too.
- `hooks/use-push-notifications.ts` is the single state machine (checking/unsupported/denied/not-enabled/enabled) for the enable/disable flow (ADR 0027); extend it rather than adding a second push-state source. `lib/push.ts` holds the Push API mechanics (SW registration, subscribe, the `localStorage` subscription-id cache).

## shadcn primitives

`components/ui/` is copied source, not an upgradeable dependency: edit it directly.

Before running `npx shadcn add <component>`, read [docs/shadcn-add-component.md](../../docs/shadcn-add-component.md): the CLI misconfigures paths, imports and dependencies here.
