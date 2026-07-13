import { test as base, type TestContext } from "vitest"
import type { Page } from "playwright"
import { seedAuthenticatedUser } from "../orchestrator/test-seam-client"
import { closeBrowser, openBrowser, type BrowserSession } from "./browser"

/**
 * Screenshots on failure aren't automatic here: this tier drives Playwright
 * directly from plain vitest tests (see ADR 0025) rather than through
 * `@vitest/browser`, which is the only thing that captures these for you.
 *
 * Vitest fixture teardown doesn't reject `use()` when the test fails — the
 * fixture's cleanup phase is triggered by the runner regardless of outcome
 * (see `resolveFixtureFunction` in `@vitest/runner`), and `onTestFailed`
 * fires only after that teardown has already closed the browser. So this
 * checks `task.result` right after `use()` settles, which is the one point
 * where the test's pass/fail state is known and the page is still open.
 * (`ctx.annotate` isn't usable here — by this point vitest already considers
 * the test finished and rejects further annotations on it.)
 */
async function runWithFailureScreenshot<T>(
  ctx: Pick<TestContext, "task">,
  page: Page,
  use: (value: T) => Promise<void>,
  value: T,
) {
  await use(value)
  if (ctx.task.result?.state === "fail") {
    const path = `test-results/failures/${ctx.task.name.replace(/[^a-z0-9]+/gi, "-")}.png`
    await page.screenshot({ path, fullPage: true })
  }
}

export interface AuthenticatedSession {
  session: BrowserSession
  page: Page
  sessionId: string
  userId: string
}

interface E2eFixtures {
  /**
   * Seeds the fixed E2E user through the test seam and opens a browser
   * session with its real session cookie already injected, so the app
   * renders authenticated on first navigation. Each test gets its own
   * freshly seeded session, so tests that invalidate theirs (logout,
   * mid-session 401) can't break their neighbours.
   */
  authenticatedSession: AuthenticatedSession
  /** A browser session with no cookie — the app sees a signed-out visitor. */
  guestSession: BrowserSession
}

export const it = base.extend<E2eFixtures>({
  authenticatedSession: async ({ task }, use) => {
    const { userId, sessionId } = await seedAuthenticatedUser()
    const session = await openBrowser(sessionId)
    try {
      await runWithFailureScreenshot({ task }, session.page, use, {
        session,
        page: session.page,
        sessionId,
        userId,
      })
    } finally {
      await closeBrowser(session)
    }
  },

  guestSession: async ({ task }, use) => {
    const session = await openBrowser()
    try {
      await runWithFailureScreenshot({ task }, session.page, use, session)
    } finally {
      await closeBrowser(session)
    }
  },
})

export const test = it
