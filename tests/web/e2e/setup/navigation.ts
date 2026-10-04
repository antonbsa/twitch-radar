import type { Page } from "playwright"

/**
 * Cancels the browser navigation of clicks on links to `href` while still
 * letting the app's own click handlers run. Playwright blocks evaluation
 * while a navigation is pending, so a link's pre-navigation state (e.g. a
 * spinner set in onClick) is only observable if the navigation never starts.
 */
export async function preventLinkNavigation(
  page: Page,
  href: string,
): Promise<void> {
  await page.evaluate((target) => {
    // Capture on document runs before React's root listener; preventDefault
    // only cancels the navigation, it doesn't stop propagation.
    document.addEventListener(
      "click",
      (event) => {
        const link = (event.target as Element).closest("a")
        if (link?.getAttribute("href") === target) event.preventDefault()
      },
      { capture: true },
    )
  }, href)
}
