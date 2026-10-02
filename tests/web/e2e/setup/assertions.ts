import type { Locator } from "playwright"

// This tier drives Playwright directly from vitest (not the `@playwright/test`
// runner, see ADR), so we don't get its bundled `expect(locator).toBeVisible()`
// matchers. Locator#waitFor already retries until the state holds or the
// timeout elapses, and throwing on timeout is exactly the assertion failure
// we want — so these thin wrappers are the retrying "expect" for this tier.

/** Retries until `locator` is visible; throws on timeout (ms). */
export async function expectVisible(
  locator: Locator,
  timeout = 5000,
): Promise<void> {
  await locator.waitFor({ state: "visible", timeout })
}

/** Retries until `locator` is hidden; throws on timeout (ms). */
export async function expectHidden(
  locator: Locator,
  timeout = 5000,
): Promise<void> {
  await locator.waitFor({ state: "hidden", timeout })
}

// Vitest's `expect.poll(...)` defaults to ~1000ms, which may be too short for
// the initial fetch and render when polling right after `page.goto`. Pass
// `{ timeout: 5000 }` for that first assertion; otherwise the default is
// sufficient after an earlier wait has absorbed the page load.
