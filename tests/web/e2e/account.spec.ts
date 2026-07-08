import { afterAll, beforeAll, describe, expect } from "vitest"
import type { Page } from "playwright"
import {
  resetState,
  revokeSession,
  seedAuthenticatedUser,
} from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"

async function mockNotificationPermission(
  page: Page,
  permission: NotificationPermission,
): Promise<void> {
  await page.addInitScript((perm) => {
    Object.defineProperty(window.Notification, "permission", {
      get: () => perm,
      configurable: true,
    })
  }, permission)
}

/**
 * Headless Chromium has no push service to subscribe against, so the browser
 * Push API surface is mocked in-page: permission starts at "default" and is
 * granted by requestPermission, and PushManager hands out a fake subscription.
 * Everything past that boundary (VAPID key fetch, POST/DELETE against the
 * real worker and D1) is exercised for real.
 */
async function mockPushEnvironment(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let permission: NotificationPermission = "default"
    Object.defineProperty(window.Notification, "permission", {
      get: () => permission,
      configurable: true,
    })
    window.Notification.requestPermission = async () => {
      permission = "granted"
      return permission
    }

    let currentSubscription: PushSubscription | null = null
    const makeSubscription = () => {
      const endpoint = `https://push.example.com/e2e/${crypto.randomUUID()}`
      return {
        endpoint,
        toJSON: () => ({
          endpoint,
          keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" },
        }),
        unsubscribe: async () => {
          currentSubscription = null
          return true
        },
      } as unknown as PushSubscription
    }
    PushManager.prototype.subscribe = async () => {
      currentSubscription ??= makeSubscription()
      return currentSubscription
    }
    PushManager.prototype.getSubscription = async () => currentSubscription
  })
}

// Each test gets its own session via the authenticatedSession fixture rather
// than sharing one from beforeAll: the logout and mid-session-401 tests
// intentionally invalidate the session they use, which would break any other
// test still relying on it.
describe("Account view", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("should show the signed-in user's identity from GET /me", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    // Re-seed with the display name before navigating: this upserts the same
    // fixed E2E user row, so the fixture's session cookie stays valid and
    // GET /me returns the new name.
    await seedAuthenticatedUser({ twitchDisplayName: "IdentityUser" })

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("IdentityUser"))
    await expect
      .poll(() => page.locator('[data-slot="avatar-fallback"]').textContent())
      .toBe("I")
  })

  it("should treat granted permission without a device subscription as not enabled", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockNotificationPermission(page, "granted")

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("Status: Not enabled"))
    await expectVisible(
      page.getByRole("button", { name: "Enable Notifications" }),
    )
  })

  it("should render not supported when the Push API is missing", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.addInitScript(() => {
      // @ts-expect-error -- simulating a browser without the Push API
      delete window.PushManager
    })

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("Status: Not supported"))
  })

  it("should enable and disable push notifications end to end", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockPushEnvironment(page)

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("Status: Not enabled"))

    await page.getByRole("button", { name: "Enable Notifications" }).click()
    await expectVisible(page.getByText("Status: Enabled"))
    await expectVisible(
      page.getByRole("button", { name: "Disable on this device" }),
    )

    await page.getByRole("button", { name: "Disable on this device" }).click()
    await expectVisible(page.getByText("Status: Not enabled"))
    await expectVisible(
      page.getByRole("button", { name: "Enable Notifications" }),
    )
  })

  it("should render the default notification permission state with an enable button", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockNotificationPermission(page, "default")

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("Status: Not enabled"))
    await expectVisible(
      page.getByRole("button", { name: "Enable Notifications" }),
    )
  })

  it("should render the denied notification permission state", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockNotificationPermission(page, "denied")

    await page.goto(`${WEB_URL}/account`)
    await expectVisible(page.getByText("Status: Denied"))
    await expectVisible(page.getByText("Go to browser settings to enable."))
  })

  it("should log out to /login and clear the authenticated context", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession

    await page.goto(`${WEB_URL}/account`)
    await page.getByRole("button", { name: "Log Out" }).click()

    await page.waitForURL("**/login")
    await expect.poll(() => page.getByRole("navigation").count()).toBe(0)
  })

  it("should show Reconnect Twitch on a mid-session 401 without navigating away", async ({
    authenticatedSession,
  }) => {
    const { page, sessionId } = authenticatedSession

    await page.goto(`${WEB_URL}/account`)
    // Confirm the initial load succeeded before yanking the session.
    await expectVisible(page.getByRole("button", { name: "Log Out" }))

    await revokeSession(sessionId)

    await page.getByRole("button", { name: "Sync Channels" }).click()
    await expectVisible(page.getByRole("button", { name: "Reconnect Twitch" }))
    expect(new URL(page.url()).pathname).toBe("/account")
  })
})
