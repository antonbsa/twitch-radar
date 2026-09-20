---
name: project-e2e-tier-no-playwright-matchers
description: tests/web/e2e drives Playwright directly from vitest, not @playwright/test — expect(locator).toHaveAttribute/toBeAttached/etc don't exist, use vitest's plain expect on awaited values instead
metadata:
  type: project
---

`tests/web/e2e` (ADR 0025) runs Playwright driven manually from vitest's `describe`/`it`/`expect`, not through the `@playwright/test` test runner. That means vitest's own chai-based `expect` is in scope, which does **not** have Playwright's locator-aware matchers (`toHaveAttribute`, `toBeVisible`, `toBeAttached`, `toBeHidden`, etc.) — calling them throws `Invalid Chai property: toHaveAttribute` at runtime, not a type error, so it's easy to write and only catch at test-run time.

**Why:** hit this directly writing a "Watch on Twitch" link assertion (`expect(watchLink).toHaveAttribute("href", ...)`) and a "modal not attached" assertion (`expect(...).not.toBeAttached()`) — both compiled fine but failed at runtime.

**How to apply:** use `tests/web/e2e/setup/assertions.ts`'s `expectVisible`/`expectHidden` (retrying `locator.waitFor`) for visibility checks. For attribute/property checks, await the value first then compare with plain vitest `expect`, e.g. `expect(await link.getAttribute("href")).toBe(...)`. For "not present at all", use `expect(await locator.count()).toBe(0)` rather than a Playwright-style attached/detached matcher.
