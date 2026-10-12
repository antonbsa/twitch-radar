import { afterAll, beforeAll, describe, expect } from "vitest"
import { resetState } from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"

describe("Page header", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("should draw the h1 at the same size and position on every tab", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    const seen: { x: number; y: number; height: number; fontSize: string }[] =
      []

    for (const path of ["/alerts", "/channels", "/account"]) {
      await page.goto(`${WEB_URL}${path}`)
      const h1 = page.getByRole("heading", { level: 1 })
      await expectVisible(h1)
      const box = await h1.boundingBox()
      const fontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize)
      seen.push({ x: box!.x, y: box!.y, height: box!.height, fontSize })
    }

    expect(seen[1]).toEqual(seen[0])
    expect(seen[2]).toEqual(seen[0])
  })
})
