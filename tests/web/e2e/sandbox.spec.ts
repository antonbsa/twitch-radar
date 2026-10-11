import { describe, expect } from "vitest"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"

// Dev tooling smoke test (ADR 0046): catches the sandbox breaking silently,
// not the personas' contents. Persona state is deliberately not reset here.
describe("Sandbox", () => {
  it("should sign in as the Full persona from the auth gate and render the authenticated app", async ({
    guestSession,
  }) => {
    const { page } = guestSession

    await page.goto(`${WEB_URL}/login`)
    await page
      .getByRole("link", { name: "Sandbox (no Twitch account)" })
      .click()
    await page.waitForURL("**/sandbox")

    await page.getByRole("button", { name: /^Full/ }).click()
    await page.waitForURL("**/channels")

    const nav = page.getByRole("navigation")
    await expectVisible(nav.getByText("Channels"))
    await expectVisible(page.getByText("Aurora_Plays"))
    expect(await page.getByRole("button", { name: /^Full/ }).count()).toBe(0)
  })

  it("should send a live event for a followed channel from the event controls", async ({
    guestSession,
  }) => {
    const { page } = guestSession

    await page.goto(`${WEB_URL}/sandbox`)
    await page.getByRole("button", { name: /^Full/ }).click()
    await page.waitForURL("**/channels")
    await page.goto(`${WEB_URL}/sandbox`)

    // Aurora is live in the fixture, so its "Switch category" is enabled.
    const aurora = page
      .getByRole("listitem")
      .filter({ hasText: "Aurora_Plays" })
    const event = page.waitForResponse("**/api/__sandbox__/events")
    await aurora.getByRole("button", { name: "Switch category" }).click()
    expect((await event).status()).toBe(200)
  })
})
