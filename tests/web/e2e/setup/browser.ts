import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright"
import { SESSION_COOKIE_NAME } from "../../../../apps/api/src/services/session"

export const MOBILE_VIEWPORT = { width: 390, height: 844 }
export const WEB_URL = "http://localhost:5173"

export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
}

/**
 * Opens a mobile-viewport browser session. When `sessionId` is provided, the
 * real session cookie is injected up front so the app renders as an already
 * authenticated user on first navigation (bypassing the non-automatable
 * Twitch OAuth redirect).
 */
export async function openBrowser(sessionId?: string): Promise<BrowserSession> {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })

  if (sessionId) {
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: sessionId,
        url: WEB_URL,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ])
  }

  const page = await context.newPage()
  return { browser, context, page }
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close()
  await session.browser.close()
}
