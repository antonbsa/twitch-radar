import { afterAll, beforeAll, describe } from "vitest"
import { resetState } from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectHidden, expectVisible } from "./setup/assertions"

// GET /api/preferences and GET /api/categories/search don't exist yet — they
// ship with T-006. Until then every real request 404s, which is exactly the
// "no retry on 4xx" path this suite guards. Tests that need a *successful*
// response mock it at the network layer instead of depending on T-006.
describe("Alerts view", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("shows the empty state when there are no global alerts", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No global alerts set."))
  })

  it("surfaces the error state quickly when preferences fail to load (no 4xx retry)", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.goto(`${WEB_URL}/alerts`)

    await expectVisible(
      page.getByText("Failed to load alerts. Try again later."),
      2000,
    )
  })

  it("opens the add-category sheet and dismisses it on tap outside", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page.getByRole("button", { name: "Add Category" }).click()

    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await expectVisible(dialog.getByText("Add Category"))

    // Tap outside (the overlay behind the sheet) to dismiss.
    await page
      .locator('[data-slot="sheet-overlay"]')
      .click({ position: { x: 5, y: 5 } })
    await expectHidden(dialog)
  })

  // T-006 (Preferences And Monitoring) owns POST/DELETE /api/preferences/* and
  // GET /api/categories/search. Seeding is wired via seedPreferences() so this
  // only needs its `.skip` removed once that backend exists.
  it.skip("adds and removes a global category preference end to end", async () => {
    // Intentionally left as a stub: real category search + add/remove flow.
  })
})
