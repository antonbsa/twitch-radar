import type { Page } from "playwright"

/**
 * Saves a PR screenshot as `test-results/pr-screenshots/<name>.png`, or
 * `<name>-<label>.png` when `npm run pr:screenshot -- --before` sets
 * SCREENSHOT_LABEL, so the same throwaway spec runs against `origin/main` and
 * the branch unchanged.
 */
export async function screenshot(page: Page, name: string) {
  const label = process.env.SCREENSHOT_LABEL
  await page.screenshot({
    path: `test-results/pr-screenshots/${name}${label ? `-${label}` : ""}.png`,
  })
}
