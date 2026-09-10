import { afterAll, beforeAll, describe, expect } from "vitest"
import {
  E2E_BROADCASTER_PREFIX,
  resetState,
  seedChannelState,
  seedFollowedChannels,
} from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectHidden, expectVisible } from "./setup/assertions"

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

  it("should show the empty state when no channels are followed", async ({
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

  it("should order live channels by viewer count desc, then offline channels by name asc", async ({
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

  it("should render live row content: live dot, category, formatted viewers, and duration", async ({
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

  it("should show a loading skeleton while channels are being fetched", async ({
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

  it("should show an error state when channels fail to load", async ({
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

  it("should disable the sync button in-flight and refetch channels on success", async ({
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

  it("should not blink the rate-limit label when sync is retried while still limited", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/sync/follows", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "sync_rate_limited",
            message: "Synced recently. Try again in a bit",
            requestId: "test",
          },
        }),
      })
    })

    await page.goto(WEB_URL)
    const syncButton = page.getByRole("button", { name: /sync/i })
    const label = page.getByText("Synced recently. Try again in a bit")

    await syncButton.click()
    await expectVisible(label)

    await syncButton.click()
    const deadline = Date.now() + 250
    while (Date.now() < deadline) {
      await expectVisible(label, 50)
      await page.waitForTimeout(20)
    }
  })

  it("should open the per-channel preference sheet from the config button", async ({
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

  // These tests assert on individual rows scoped by broadcaster ID rather
  // than the raw row count — the E2E user's followed-channel list accumulates
  // across every test in this file (no per-test reset; see the fixture note
  // in setup/fixtures.ts about each test getting its own session, not its own
  // data), so a bare count would be flaky depending on run order.
  describe("search, filter, and sort controls", () => {
    it("should filter the list by search text matching name or login", async ({
      authenticatedSession,
    }) => {
      const zebra = broadcasterId("search_zebra")
      const apple = broadcasterId("search_apple")

      await seedFollowedChannels([
        {
          broadcasterUserId: zebra,
          broadcasterLogin: "zebra",
          broadcasterDisplayName: "SearchZebra",
        },
        {
          broadcasterUserId: apple,
          broadcasterLogin: "apple",
          broadcasterDisplayName: "SearchApple",
        },
      ])
      await seedChannelState([
        { broadcasterUserId: zebra, isLive: false },
        { broadcasterUserId: apple, isLive: false },
      ])

      const { page } = authenticatedSession
      await page.goto(WEB_URL)

      const zebraRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${zebra}"]`,
      )
      const appleRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${apple}"]`,
      )
      await expectVisible(zebraRow)
      await expectVisible(appleRow)

      await page.getByPlaceholder("Search channels...").fill("zeb")
      await expectVisible(zebraRow)
      await expectHidden(appleRow)
    })

    it("should narrow the live section by the selected category", async ({
      authenticatedSession,
    }) => {
      const chatting = broadcasterId("category_chatting")
      const music = broadcasterId("category_music")

      await seedFollowedChannels([
        {
          broadcasterUserId: chatting,
          broadcasterLogin: "categorychatting",
          broadcasterDisplayName: "CategoryChatting",
        },
        {
          broadcasterUserId: music,
          broadcasterLogin: "categorymusic",
          broadcasterDisplayName: "CategoryMusic",
        },
      ])
      await seedChannelState([
        {
          broadcasterUserId: chatting,
          isLive: true,
          categoryName: "Just Chatting",
          viewerCount: 10,
        },
        {
          broadcasterUserId: music,
          isLive: true,
          categoryName: "Music",
          viewerCount: 20,
        },
      ])

      const { page } = authenticatedSession
      await page.goto(WEB_URL)

      const chattingRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${chatting}"]`,
      )
      const musicRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${music}"]`,
      )
      await expectVisible(chattingRow)
      await expectVisible(musicRow)

      await page.getByRole("combobox", { name: "Filter by category" }).click()
      await page.getByRole("option", { name: "Music" }).click()

      await expectVisible(musicRow)
      await expectHidden(chattingRow)
    })

    it("should reorder channels alphabetically when 'Name (A-Z)' sort is selected", async ({
      authenticatedSession,
    }) => {
      const highViewer = broadcasterId("sort_high")
      const lowViewer = broadcasterId("sort_low")

      await seedFollowedChannels([
        {
          broadcasterUserId: highViewer,
          broadcasterLogin: "sorthigh",
          broadcasterDisplayName: "SortSetZeta",
        },
        {
          broadcasterUserId: lowViewer,
          broadcasterLogin: "sortlow",
          broadcasterDisplayName: "SortSetAlpha",
        },
      ])
      await seedChannelState([
        { broadcasterUserId: highViewer, isLive: true, viewerCount: 5000 },
        { broadcasterUserId: lowViewer, isLive: true, viewerCount: 100 },
      ])

      const { page } = authenticatedSession
      await page.goto(WEB_URL)

      const highRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${highViewer}"]`,
      )
      const lowRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${lowViewer}"]`,
      )
      await expectVisible(highRow)
      await expectVisible(lowRow)

      async function highIsAboveLow(): Promise<boolean> {
        const [highBox, lowBox] = await Promise.all([
          highRow.boundingBox(),
          lowRow.boundingBox(),
        ])
        if (!highBox || !lowBox) return false
        return highBox.y < lowBox.y
      }

      // Default sort is by viewers desc: SortSetZeta (5000) above SortSetAlpha (100).
      await expect.poll(highIsAboveLow).toBe(true)

      await page.getByRole("combobox", { name: "Sort channels" }).click()
      await page.getByRole("option", { name: "Name (A-Z)" }).click()

      // Alphabetical: SortSetAlpha above SortSetZeta.
      await expect.poll(highIsAboveLow).toBe(false)
    })
  })
})
