import type { Page } from "playwright"

export async function mockNotificationPermission(
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
export async function mockPushEnvironment(page: Page): Promise<void> {
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
