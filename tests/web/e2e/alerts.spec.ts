import { afterAll, beforeAll, describe } from "vitest"
import { resetState } from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectHidden, expectVisible } from "./setup/assertions"

describe("Alerts view", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("should show the empty state when there are no global alerts", async ({
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

  it("should surface the error state quickly when preferences fail to load (no 4xx retry)", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "not_found", message: "Route not found" },
        }),
      }),
    )
    await page.goto(`${WEB_URL}/alerts`)

    await expectVisible(
      page.getByText("Failed to load alerts. Try again later."),
      2000,
    )
  })

  it("should open the add-category sheet and dismiss it on tap outside", async ({
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

  it("should add and remove a global category preference end to end", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    // Only category search is mocked — this tier has no mock Twitch server
    // and search proxies to the real Twitch API. The preference add/remove
    // round-trips below hit the real backend (the seeded E2E user has no
    // followed channels, so no monitoring work reaches Twitch either).
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "27471", name: "Minecraft", box_art_url: null }],
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No global alerts set."))

    await page.getByRole("button", { name: "Add Category" }).click()
    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)

    await dialog.getByPlaceholder("Search categories...").fill("mine")
    await dialog.getByRole("button", { name: "Minecraft" }).click()

    // The sheet closes on success and the refreshed list shows the new alert.
    await expectHidden(dialog)
    await expectVisible(page.getByText("Minecraft"))
    await expectHidden(page.getByText("No global alerts set."))

    await page.getByRole("button", { name: "Remove Minecraft" }).click()
    await expectVisible(page.getByText("No global alerts set."))
    await expectHidden(page.getByText("Minecraft"))
  })
})
