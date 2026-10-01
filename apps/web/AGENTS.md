# apps/web

Frontend conventions for the React/Vite PWA (Tailwind v4, shadcn/ui, TanStack Query, React Router v7). Loaded when you read files under `apps/web`.

## Internationalization (ADR 0044)

- All user-visible text goes through the i18n catalog: never a hardcoded string in JSX, a `placeholder`/`aria-label`/`title` attribute, or a toast/error message shown to the user.
- Add a key to `public/locales/en.json` and resolve it with `useLanguage().t()`; use `interpolateNodes` from `lib/i18n-react.tsx` when the text embeds JSX (e.g. a bolded name).
- `en.json`, `es.json` and `pt-BR.json` stay in lockstep. A key missing from the other two is a silent bug (the string falls back to the raw key or the `en` text), not a partial rollout.
- The service worker (`public/service-worker.js`) and the backend (`NotificationJobMessage`'s `{titleKey, bodyKey, params, lang}`) also pass catalog keys, not literal text. A hook or handler that resolves user-facing text returns a key for its caller to look up, unless it is the one place actually rendering it.

## Buttons and cursor

Tailwind v4's Preflight doesn't give `<button>` a pointer cursor, so `src/index.css` restores it globally in `@layer base` for every enabled `button` and `[role="button"]`.

- Don't add `cursor-pointer` to a `<button>`, a `Button`, or a `Badge asChild` wrapping a `<button>`.
- Add it only on a clickable non-button (a row `div` with `onClick`, a Radix `option`/`menuitem`).
- `disabled:cursor-not-allowed` still wins, since utilities outrank the base layer.

## Data and state

- Every API-backed read/write goes through a hook in `hooks/` built on `useQuery`/`useSessionAwareMutation`, never a raw `fetch` in a component. Mutations invalidate the relevant query key on success (see `hooks/use-preferences.ts`).
- `useSessionAwareMutation` is what marks a session expired on a 401; don't write a separate 401 handler.
- API calls go through `lib/api.ts`'s `api.get/post/delete` wrapper (same-origin via the Vite dev proxy). Errors are typed with `ApiRequestError`/`ApiErrorBody` from `lib/errors.ts`, matching the API's error envelope (ADR 0009).
- `types/*.ts` mirror `apps/api`'s snake_case wire shapes by hand instead of importing across the workspace boundary (ADR 0028). When a response shape changes, update the mirrored type too.
- `hooks/use-push-notifications.ts` is the single state machine (checking/unsupported/denied/not-enabled/enabled) for the enable/disable flow (ADR 0027); extend it rather than adding a second push-state source. `lib/push.ts` holds the Push API mechanics (SW registration, subscribe, the `localStorage` subscription-id cache).

## shadcn primitives

`components/ui/` is copied source, not an upgradeable dependency: edit it directly.

- Before `npx shadcn add <component>`, confirm `@/*` is declared in both `tsconfig.json` and `tsconfig.app.json`, or it silently writes to a literal `./@` directory instead of `src/components/ui/`.
- The CLI (style `radix-nova`) also emits `import { cn } from "cn"` instead of `@/lib/utils`, adds a bogus `cn` npm dependency, and blocks on an interactive "button.tsx already exists, overwrite?" prompt that `--yes` doesn't answer (pipe `printf 'n\n'`; never let it overwrite `button.tsx`).
- After any `shadcn add`: revert `package.json`/`package-lock.json` (`git checkout`, then `npm install`), fix the `cn` import to `@/lib/utils`, and route literal text it hardcodes (e.g. sr-only "Close") through `useLanguage().t()`, matching `ui/sheet.tsx` (key `common.close`).

## E2E tier

`tests/web/e2e` drives Playwright manually from vitest, not through `@playwright/test`, so vitest's chai `expect` is in scope and Playwright's locator matchers (`toHaveAttribute`, `toBeVisible`, `toBeAttached`, ...) don't exist: they throw `Invalid Chai property` at runtime, not a type error.

- Visibility: `expectVisible`/`expectHidden` from `tests/web/e2e/setup/assertions.ts`.
- Attributes/properties: await the value, then compare with plain `expect` (`expect(await link.getAttribute("href")).toBe(...)`).
- Absence: `expect(await locator.count()).toBe(0)`.
