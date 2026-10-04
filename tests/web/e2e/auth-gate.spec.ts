import { afterAll, beforeAll, describe, expect } from "vitest"
import { resetState } from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"
import { preventLinkNavigation } from "./setup/navigation"

describe("Auth gate", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("should redirect to /login and hide the tab bar without a session cookie", async ({
    guestSession,
  }) => {
    const { page } = guestSession

    await page.goto(WEB_URL)
    await page.waitForURL("**/login")

    await expectVisible(page.getByRole("heading", { name: "Twitch Radar" }))
    await expect.poll(() => page.getByRole("navigation").count()).toBe(0)
  })

  it("should show a pending state on Connect with Twitch as soon as it is clicked", async ({
    guestSession,
  }) => {
    const { page } = guestSession
    await page.goto(`${WEB_URL}/login`)
    const connect = page.locator(`a[href="/api/auth/twitch/start"]`)
    expect(await connect.getAttribute("aria-busy")).toBe("false")
    expect(await connect.getAttribute("href")).toBe("/api/auth/twitch/start")

    await preventLinkNavigation(page, "/api/auth/twitch/start")
    await connect.click()
    await expect.poll(() => connect.getAttribute("aria-busy")).toBe("true")
    expect(await connect.getAttribute("aria-disabled")).toBe("true")
    await expectVisible(page.getByRole("link", { name: "Connecting…" }))
  })

  it("should land on /channels with the tab bar visible when a seeded session cookie is present", async ({
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
