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
})
