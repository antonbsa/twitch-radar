import { afterAll, beforeAll, describe, expect } from "vitest"
import { resetState } from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"

describe("Auth gate", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("redirects to /login and hides the tab bar without a session cookie", async ({
    guestSession,
  }) => {
    const { page } = guestSession

    await page.goto(WEB_URL)
    await page.waitForURL("**/login")

    await expectVisible(page.getByRole("heading", { name: "Twitch Radar" }))
    await expect.poll(() => page.getByRole("navigation").count()).toBe(0)
  })

  it("lands on /channels with the tab bar visible when a seeded session cookie is present", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession

    await page.goto(WEB_URL)
    await page.waitForURL("**/channels")

    const nav = page.getByRole("navigation")
    await expectVisible(nav)
    await expectVisible(nav.getByText("Channels"))
    await expectVisible(nav.getByText("Alerts"))
    await expectVisible(nav.getByText("Account"))
  })
})
