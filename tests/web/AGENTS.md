# tests/web

Conventions for the web test tiers (`e2e/`, `unit/`).

## E2E assertions

`tests/web/e2e` drives Playwright manually from vitest, not through `@playwright/test`, so vitest's chai `expect` is in scope and Playwright's locator matchers (`toHaveAttribute`, `toBeVisible`, `toBeAttached`, ...) don't exist: they throw `Invalid Chai property` at runtime, not a type error.

- Visibility: `expectVisible`/`expectHidden` from `tests/web/e2e/setup/assertions.ts`.
- Attributes/properties: await the value, then compare with plain `expect` (`expect(await link.getAttribute("href")).toBe(...)`).
- Absence: `expect(await locator.count()).toBe(0)`.
