import { test as base } from "vitest"
import type { Page } from "playwright"
import { seedAuthenticatedUser } from "../orchestrator/test-seam-client"
import { closeBrowser, openBrowser, type BrowserSession } from "./browser"

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
  // Vitest fixtures require a destructuring pattern for the context param
  // (that's how it detects which fixtures a test uses), hence the empty
  // pattern and the targeted disables below.
  // eslint-disable-next-line no-empty-pattern
  authenticatedSession: async ({}, use) => {
    const { userId, sessionId } = await seedAuthenticatedUser()
    const session = await openBrowser(sessionId)
    try {
      await use({ session, page: session.page, sessionId, userId })
    } finally {
      await closeBrowser(session)
    }
  },

  // eslint-disable-next-line no-empty-pattern
  guestSession: async ({}, use) => {
    const session = await openBrowser()
    try {
      await use(session)
    } finally {
      await closeBrowser(session)
    }
  },
})

export const test = it
