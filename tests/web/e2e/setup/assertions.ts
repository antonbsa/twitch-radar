import type { Locator } from "playwright"

// This tier drives Playwright directly from vitest (not the `@playwright/test`
// runner, see ADR), so we don't get its bundled `expect(locator).toBeVisible()`
// matchers. Locator#waitFor already retries until the state holds or the
// timeout elapses, and throwing on timeout is exactly the assertion failure
// we want — so these thin wrappers are the retrying "expect" for this tier.
export async function expectVisible(
  locator: Locator,
  timeout = 5000,
): Promise<void> {
  await locator.waitFor({ state: "visible", timeout })
}

export async function expectHidden(
  locator: Locator,
  timeout = 5000,
): Promise<void> {
  await locator.waitFor({ state: "hidden", timeout })
}
