import { test as base, type TestContext } from "vitest"
import type { Page } from "playwright"
import { seedAuthenticatedUser } from "../orchestrator/test-seam-client"
import { closeBrowser, openBrowser, type BrowserSession } from "./browser"

/** Browser session of each running test, by task id, so the `it` wrapper can screenshot it. */
const sessions = new Map<string, BrowserSession>()

/**
 * Failure artifacts aren't automatic here: this tier drives Playwright directly
 * from plain vitest tests (see ADR 0025) rather than through `@vitest/browser`,
 * which is the only thing that captures them for you. CI publishes them with
 * the html report (ADR 0060).
 *
 * The screenshot is attached to the test as an annotation (see `it` below), so
 * it renders under the error in the html report. The trace can't be: vitest
 * rejects `annotate` once the test has finished, and fixture teardown runs
 * after that. The fixture instead checks `task.result` right after `use()`
 * settles, the one point where the pass/fail state is known and the page is
 * still open (`onTestFailed` fires only after the browser is closed), and
 * saves the trace file, closing the session since the trace is only written
 * (or dropped) at close.
 */
async function runWithFailureArtifacts<T>(
  ctx: Pick<TestContext, "task">,
  session: BrowserSession,
  use: (value: T) => Promise<void>,
  value: T,
) {
  let tracePath: string | undefined
  sessions.set(ctx.task.id, session)
  try {
    await use(value)
    if (ctx.task.result?.state === "fail") {
      const name = ctx.task.name.replace(/[^a-z0-9]+/gi, "-")
      tracePath = `test-results/e2e/traces/${name}.zip`
    }
  } finally {
    sessions.delete(ctx.task.id)
    await closeBrowser(session, tracePath)
  }
}

/**
 * Wraps a test body to attach a full-page screenshot as an annotation when it
 * throws: inside the body is the only place `annotate` still works.
 */
function withFailureScreenshot(fn: (ctx: TestContext) => Promise<void>) {
  const wrapped = async (ctx: TestContext) => {
    try {
      await fn(ctx)
    } catch (error) {
      const page = sessions.get(ctx.task.id)?.page
      if (page) {
        const body = await page.screenshot({ fullPage: true })
        await ctx.annotate("Failure screenshot", {
          contentType: "image/png",
          body,
        })
      }
      throw error
    }
  }
  // Vitest finds the fixtures a test uses by parsing the function source, so
  // the wrapper has to report the original's, or no fixture would be set up.
  wrapped.toString = () => fn.toString()
  return wrapped
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

const e2eTest = base.extend<E2eFixtures>({
  authenticatedSession: async ({ task }, use) => {
    // Seed a live (non-expired, never-failed) Twitch token by default so
    // GET /me's twitch_reconnect_required comes back false — matching the
    // "normally connected" user nearly every test implicitly assumes. Tests
    // that specifically want the reconnect-required state (e.g. a mid-session
    // 401) provoke it themselves rather than relying on the fixture default.
    // Also stamp a fresh follow sync so the app's auto-sync on load (issue
    // #88) doesn't fire a real POST /sync/follows; tests covering auto-sync
    // re-seed lastFollowSyncAt: null and route-mock the sync themselves.
    const { userId, sessionId } = await seedAuthenticatedUser({
      accessToken: "e2e-fixture-access-token",
      refreshToken: "e2e-fixture-refresh-token",
      lastFollowSyncAt: new Date().toISOString(),
    })
    const session = await openBrowser(sessionId)
    await runWithFailureArtifacts({ task }, session, use, {
      session,
      page: session.page,
      sessionId,
      userId,
    })
  },

  guestSession: async ({ task }, use) => {
    const session = await openBrowser()
    await runWithFailureArtifacts({ task }, session, use, session)
  },
})

export const it = new Proxy(e2eTest, {
  apply(target, thisArg, args: unknown[]) {
    return Reflect.apply(
      target,
      thisArg,
      args.map((arg) =>
        typeof arg === "function" ? withFailureScreenshot(arg as never) : arg,
      ),
    )
  },
})

export const test = it
