import { afterAll, beforeAll, describe, expect } from "vitest"
import {
  E2E_BROADCASTER_PREFIX,
  resetState,
  seedChannelState,
  seedFollowedChannels,
} from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectVisible } from "./setup/assertions"

function broadcasterId(suffix: string): string {
  return `${E2E_BROADCASTER_PREFIX}channels_${suffix}`
}

describe("Channels view", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("shows the empty state when no channels are followed", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    await expectVisible(
      page.getByText(
        "No followed channels yet. Sync to pull your Twitch follows.",
      ),
    )
  })

  it("orders live channels by viewer count desc, then offline channels by name asc", async ({
    authenticatedSession,
  }) => {
    const highViewer = broadcasterId("high")
    const lowViewer = broadcasterId("low")
    const zebra = broadcasterId("zebra")
    const apple = broadcasterId("apple")

    await seedFollowedChannels([
      {
        broadcasterUserId: zebra,
        broadcasterLogin: "zebra",
        broadcasterDisplayName: "Zebra",
      },
      {
        broadcasterUserId: apple,
        broadcasterLogin: "apple",
        broadcasterDisplayName: "Apple",
      },
      {
        broadcasterUserId: highViewer,
        broadcasterLogin: "highviewer",
        broadcasterDisplayName: "HighViewer",
      },
      {
        broadcasterUserId: lowViewer,
        broadcasterLogin: "lowviewer",
        broadcasterDisplayName: "LowViewer",
      },
    ])
    await seedChannelState([
      { broadcasterUserId: zebra, isLive: false },
      { broadcasterUserId: apple, isLive: false },
      { broadcasterUserId: highViewer, isLive: true, viewerCount: 5000 },
      { broadcasterUserId: lowViewer, isLive: true, viewerCount: 100 },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    const rows = page.getByTestId("channel-row")
    await expect.poll(() => rows.count()).toBe(4)
    await expect
      .poll(() => rows.nth(0).getAttribute("data-broadcaster-user-id"))
      .toBe(highViewer)
    await expect
      .poll(() => rows.nth(1).getAttribute("data-broadcaster-user-id"))
      .toBe(lowViewer)
    await expect
      .poll(() => rows.nth(2).getAttribute("data-broadcaster-user-id"))
      .toBe(apple)
    await expect
      .poll(() => rows.nth(3).getAttribute("data-broadcaster-user-id"))
      .toBe(zebra)
  })

  it("renders live row content: live dot, category, formatted viewers, and duration", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("content")
    const startedAt = new Date(Date.now() - 83 * 60_000).toISOString()

    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "contentstreamer",
        broadcasterDisplayName: "ContentStreamer",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: id,
        isLive: true,
        categoryName: "Just Chatting",
        viewerCount: 1234,
        startedAt,
      },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await expectVisible(row.locator('[data-slot="avatar-badge"]'))
    await expectVisible(row.getByText("Just Chatting · 1.2K viewers"))
    await expectVisible(row.getByText("In Just Chatting for 1h 23m"))
  })

  it("shows a loading skeleton while channels are being fetched", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/channels/followed", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
    })

    await page.goto(WEB_URL)
    await expectVisible(page.locator('[data-slot="skeleton"]').first())
  })

  it("shows an error state when channels fail to load", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/channels/followed", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "bad_request", message: "boom", requestId: "test" },
        }),
      }),
    )

    await page.goto(WEB_URL)
    await expectVisible(
      page.getByText(
        "Failed to load channels. Try syncing or reload the page.",
      ),
    )
  })

  it("disables the sync button in-flight and refetches channels on success", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    let followedCalls = 0

    await page.route("**/api/channels/followed", (route) => {
      followedCalls++
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
    })
    await page.route("**/api/sync/follows", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto(WEB_URL)
    await expectVisible(
      page.getByText(
        "No followed channels yet. Sync to pull your Twitch follows.",
      ),
    )
    const callsBeforeSync = followedCalls

    const syncButton = page.getByRole("button", { name: /sync/i })
    await syncButton.click()
    await expect.poll(() => syncButton.isDisabled()).toBe(true)
    await expect
      .poll(() => syncButton.isDisabled(), { timeout: 3000 })
      .toBe(false)
    expect(followedCalls).toBeGreaterThan(callsBeforeSync)
  })

  it("opens the per-channel preference sheet from the config button", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("config")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "configstreamer",
        broadcasterDisplayName: "ConfigStreamer",
      },
    ])
    await seedChannelState([{ broadcasterUserId: id, isLive: false }])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    await page.getByRole("button", { name: "Configure ConfigStreamer" }).click()
    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await expectVisible(dialog.getByText("ConfigStreamer"))
  })
})
