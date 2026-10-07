import { afterAll, beforeAll, describe, expect } from "vitest"
import {
  E2E_BROADCASTER_PREFIX,
  resetState,
  seedAuthenticatedUser,
  seedChannelState,
  seedFollowedChannels,
  seedPreferences,
} from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectHidden, expectVisible } from "./setup/assertions"
import { mockPushEnvironment } from "./setup/push-mocks"

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
    // Initial fetch and render can exceed Vitest's default poll timeout under CI load.
    await expect.poll(() => rows.count(), { timeout: 5000 }).toBe(4)
    await expect
      .poll(() => rows.nth(0).getAttribute("data-broadcaster-user-id"), {
        timeout: 5000,
      })
      .toBe(highViewer)
    await expect
      .poll(() => rows.nth(1).getAttribute("data-broadcaster-user-id"), {
        timeout: 5000,
      })
      .toBe(lowViewer)
    await expect
      .poll(() => rows.nth(2).getAttribute("data-broadcaster-user-id"), {
        timeout: 5000,
      })
      .toBe(apple)
    await expect
      .poll(() => rows.nth(3).getAttribute("data-broadcaster-user-id"), {
        timeout: 5000,
      })
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
    await expectVisible(row.getByText("1.2K viewers"))
    await expectVisible(row.getByText("In Just Chatting for 1h 23m"))
    // The category appears once, inside the "In … for …" line.
    expect(
      ((await row.textContent()) ?? "").match(/Just Chatting/g),
    ).toHaveLength(1)
  })

  it("should highlight a live channel in a preferred category, marking global matches with a globe", async ({
    authenticatedSession,
  }) => {
    const specific = broadcasterId("pref_specific")
    const global = broadcasterId("pref_global")
    const plain = broadcasterId("pref_plain")
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString()

    await seedFollowedChannels(
      [
        [specific, "PrefSpecific"],
        [global, "PrefGlobal"],
        [plain, "PrefPlain"],
      ].map(([id, name]) => ({
        broadcasterUserId: id!,
        broadcasterLogin: name!.toLowerCase(),
        broadcasterDisplayName: name!,
      })),
    )
    await seedChannelState([
      {
        broadcasterUserId: specific,
        isLive: true,
        categoryId: "apex",
        categoryName: "Apex Legends",
        viewerCount: 30,
        startedAt,
      },
      {
        broadcasterUserId: global,
        isLive: true,
        categoryId: "chat",
        categoryName: "Just Chatting",
        viewerCount: 20,
        startedAt,
      },
      {
        broadcasterUserId: plain,
        isLive: true,
        categoryId: "mc",
        categoryName: "Minecraft",
        viewerCount: 10,
        startedAt,
      },
    ])
    await seedPreferences({
      channel: [
        {
          broadcasterUserId: specific,
          categoryId: "apex",
          categoryName: "Apex Legends",
        },
        // A preference for another channel must not highlight this one.
        {
          broadcasterUserId: plain,
          categoryId: "apex",
          categoryName: "Apex Legends",
        },
      ],
      global: [{ categoryId: "chat", categoryName: "Just Chatting" }],
    })

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    const match = (id: string) =>
      page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${id}"] [data-preference-match]`,
      )
    await expectVisible(match(specific))
    expect(await match(specific).getAttribute("data-preference-match")).toBe(
      "channel",
    )
    expect(await match(specific).locator("svg").count()).toBe(0)
    expect(await match(global).getAttribute("data-preference-match")).toBe(
      "global",
    )
    expect(await match(global).locator("svg").count()).toBe(1)
    expect(await match(plain).count()).toBe(0)
  })

  it("should show what an offline channel was last streaming, falling back to Offline without data", async ({
    authenticatedSession,
  }) => {
    const withLast = broadcasterId("last_live")
    const withoutLast = broadcasterId("no_last_live")

    await seedFollowedChannels([
      {
        broadcasterUserId: withLast,
        broadcasterLogin: "lastlive",
        broadcasterDisplayName: "LastLive",
      },
      {
        broadcasterUserId: withoutLast,
        broadcasterLogin: "nolastlive",
        broadcasterDisplayName: "NoLastLive",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: withLast,
        isLive: false,
        lastLiveAt: new Date(Date.now() - 3 * 3_600_000 - 60_000).toISOString(),
        lastCategoryId: "apex",
        lastCategoryName: "Apex Legends",
      },
      { broadcasterUserId: withoutLast, isLive: false },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    const row = (id: string) =>
      page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
      )
    await expectVisible(
      row(withLast).getByText("Was in Apex Legends 3 hours ago"),
    )
    await expectVisible(row(withoutLast).getByText("Offline"))
  })

  it("should show a loading skeleton mirroring the filters bar, section headers and live/offline rows", async ({
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
    const loading = page.getByTestId("channels-loading")
    await expectVisible(loading)
    expect(await loading.getByTestId("channel-row-skeleton").count()).toBe(8)
  })

  it("should not shift live or offline rows when the skeleton is replaced by loaded channels", async ({
    authenticatedSession,
  }) => {
    const live = broadcasterId("noshift_live")
    const offline = broadcasterId("noshift_offline")
    await seedFollowedChannels([
      {
        broadcasterUserId: live,
        broadcasterLogin: "noshiftlive",
        broadcasterDisplayName: "NoShiftLive",
      },
      {
        broadcasterUserId: offline,
        broadcasterLogin: "noshiftoffline",
        broadcasterDisplayName: "NoShiftOffline",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: live,
        isLive: true,
        categoryName: "Just Chatting",
        viewerCount: 10,
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
    ])

    const { page } = authenticatedSession
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route("**/api/channels/followed", async (route) => {
      await released
      await route.continue()
    })

    await page.goto(WEB_URL)
    const skeletonRows = page.getByTestId("channel-row-skeleton")
    await expectVisible(skeletonRows.first())
    const liveSkeleton = await skeletonRows.nth(0).boundingBox()
    const offlineSkeletonHeight = (await skeletonRows.nth(5).boundingBox())
      ?.height

    release()
    const liveRow = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${live}"]`,
    )
    const offlineRow = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${offline}"]`,
    )
    await expectVisible(liveRow)

    // Earlier tests' channels may sort ahead of ours, so position is checked
    // on whichever row comes first and height on our own rows.
    const firstRow = await page.getByTestId("channel-row").first().boundingBox()
    expect(firstRow?.y).toBe(liveSkeleton?.y)
    expect((await liveRow.boundingBox())?.height).toBe(liveSkeleton?.height)
    expect((await offlineRow.boundingBox())?.height).toBe(offlineSkeletonHeight)
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

  it("should disable the sync button in-flight and update channels from the sync response without a toast", async ({
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
        // POST /sync/follows returns the synced channel list itself (issue
        // #83) — the UI must render from this response directly, without a
        // follow-up GET /channels/followed round trip.
        body: JSON.stringify({
          data: [
            {
              broadcaster_user_id: broadcasterId("pulled"),
              broadcaster_login: "pulledstreamer",
              broadcaster_display_name: "PulledStreamer",
              broadcaster_profile_image_url: null,
              followed_at: "2024-01-01T00:00:00Z",
              is_live: false,
              stream_id: null,
              category_id: null,
              category_name: null,
              title: null,
              thumbnail_url: null,
              viewer_count: null,
              started_at: null,
            },
          ],
        }),
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
    await expectVisible(page.getByText("PulledStreamer"))
    expect(followedCalls).toBe(callsBeforeSync)
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0)
  })

  it("should show an error toast when a manual sync fails", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/sync/follows", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "twitch_unavailable",
            message: "Twitch is unavailable",
            requestId: "req_e2e",
          },
        }),
      }),
    )

    await page.goto(WEB_URL)
    await page.getByRole("button", { name: /sync/i }).click()

    await expectVisible(page.getByText("Could not sync channels. Try again."))
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

      const searchInput = page.getByPlaceholder("Search")
      const clearButton = page.getByRole("button", { name: "Clear search" })

      await expectHidden(clearButton)

      await searchInput.fill("zeb")
      await expectVisible(zebraRow)
      await expectHidden(appleRow)
      await expectVisible(clearButton)

      await clearButton.click()
      expect(await searchInput.inputValue()).toBe("")
      await expectVisible(zebraRow)
      await expectVisible(appleRow)
      await expectHidden(clearButton)
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

      await page.getByRole("button", { name: "Filter by category" }).click()
      await page.getByRole("menuitemcheckbox", { name: "Music" }).click()

      await expectVisible(musicRow)
      await expectHidden(chattingRow)
    })

    it("should narrow the live section to any of multiple selected categories", async ({
      authenticatedSession,
    }) => {
      const chatting = broadcasterId("multicategory_chatting")
      const music = broadcasterId("multicategory_music")
      const art = broadcasterId("multicategory_art")

      await seedFollowedChannels([
        {
          broadcasterUserId: chatting,
          broadcasterLogin: "multicategorychatting",
          broadcasterDisplayName: "MultiCategoryChatting",
        },
        {
          broadcasterUserId: music,
          broadcasterLogin: "multicategorymusic",
          broadcasterDisplayName: "MultiCategoryMusic",
        },
        {
          broadcasterUserId: art,
          broadcasterLogin: "multicategoryart",
          broadcasterDisplayName: "MultiCategoryArt",
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
        {
          broadcasterUserId: art,
          isLive: true,
          categoryName: "Art",
          viewerCount: 30,
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
      const artRow = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${art}"]`,
      )
      await expectVisible(chattingRow)
      await expectVisible(musicRow)
      await expectVisible(artRow)

      await page.getByRole("button", { name: "Filter by category" }).click()
      await page.getByRole("menuitemcheckbox", { name: "Music" }).click()
      await page.getByRole("menuitemcheckbox", { name: "Art" }).click()
      await page.keyboard.press("Escape")

      await expectVisible(musicRow)
      await expectVisible(artRow)
      await expectHidden(chattingRow)

      // Re-opening and checking "All categories" clears the selection.
      await page.getByRole("button", { name: "Filter by category" }).click()
      await page
        .getByRole("menuitemcheckbox", { name: "All categories" })
        .click()
      await page.keyboard.press("Escape")

      await expectVisible(chattingRow)
      await expectVisible(musicRow)
      await expectVisible(artRow)
    })

    it("should only close the category dropdown, not act on the row underneath, when clicking outside it on a channel row", async ({
      authenticatedSession,
    }) => {
      const id = broadcasterId("dropdown_outside_click")
      await seedFollowedChannels([
        {
          broadcasterUserId: id,
          broadcasterLogin: "dropdownoutsideclick",
          broadcasterDisplayName: "DropdownOutsideClick",
        },
      ])
      await seedChannelState([
        {
          broadcasterUserId: id,
          isLive: true,
          categoryName: "Just Chatting",
          viewerCount: 10,
        },
      ])

      const { page } = authenticatedSession
      await page.goto(WEB_URL)

      const row = page.locator(
        `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
      )
      await expectVisible(row)

      await page.getByRole("button", { name: "Filter by category" }).click()
      const menu = page.getByRole("menu")
      await expectVisible(menu)

      // force: true - Radix menu sets pointer-events to "none", making the row
      // appear unclickable to Playwright's static hit-test, but it becomes
      // clickable dynamically when pointerdown dismisses the menu first.
      await row.click({ force: true })

      await expectHidden(menu)
      expect(await page.getByTestId("channel-detail-modal").count()).toBe(0)
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

  it("should open the channel detail modal when clicking a row, showing the snapshot, category, title, viewers, and a Twitch link", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("detail")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "detailstreamer",
        broadcasterDisplayName: "DetailStreamer",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: id,
        isLive: true,
        categoryName: "Just Chatting",
        title: "Chatting with viewers",
        thumbnailUrl: "https://example.com/detailstreamer-thumb.jpg",
        viewerCount: 1234,
      },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await expectVisible(row)
    await row.click()

    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)
    await expectVisible(modal.getByText("DetailStreamer"))
    await expectVisible(modal.getByText("Chatting with viewers"))
    await expectVisible(modal.getByText(/Just Chatting/))
    await expectVisible(modal.getByText("1.2K viewers"))
    await expectVisible(
      modal.locator(`img[src="https://example.com/detailstreamer-thumb.jpg"]`),
    )

    const watchLink = modal.getByRole("link", { name: "Watch on Twitch" })
    await expectVisible(watchLink)
    expect(await watchLink.getAttribute("href")).toBe(
      "https://twitch.tv/detailstreamer",
    )
    expect(await watchLink.getAttribute("target")).toBe("_blank")
  })

  it("should open only the preferences sheet, not the detail modal, when clicking the config button", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("config-not-detail")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "confignotdetail",
        broadcasterDisplayName: "ConfigNotDetail",
      },
    ])
    await seedChannelState([{ broadcasterUserId: id, isLive: false }])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)

    await page
      .getByRole("button", { name: "Configure ConfigNotDetail" })
      .click()

    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await expectVisible(dialog.getByText("ConfigNotDetail"))
    expect(await page.getByTestId("channel-detail-modal").count()).toBe(0)
  })

  it("should open the detail modal for the ?broadcaster= deep link and clear it from the URL", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("deeplink")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "deeplinkstreamer",
        broadcasterDisplayName: "DeepLinkStreamer",
      },
    ])
    await seedChannelState([{ broadcasterUserId: id, isLive: false }])

    const { page } = authenticatedSession
    await page.goto(`${WEB_URL}/channels?broadcaster=${id}`)

    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)
    await expectVisible(modal.getByText("DeepLinkStreamer"))

    await expect
      .poll(() => new URL(page.url()).searchParams.get("broadcaster"))
      .toBe(null)
  })

  it("should offer a one-tap suggestion to notify for a live channel's current category", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("suggest")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "suggeststreamer",
        broadcasterDisplayName: "SuggestStreamer",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: id,
        isLive: true,
        categoryId: "509658",
        categoryName: "Just Chatting",
        viewerCount: 10,
      },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await row.click()
    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)

    const suggestion = modal.getByRole("button", { name: "Alert me when" })
    await expectVisible(suggestion)

    await suggestion.click()

    // Saved: the button flips to the checked "already notifying" state.
    await expectHidden(suggestion)
    await expectVisible(modal.getByRole("button", { name: "Alert on" }))
  })

  it("should not offer the live-category suggestion for an offline channel", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("suggest_offline")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "offlinestreamer",
        broadcasterDisplayName: "OfflineStreamer",
      },
    ])
    await seedChannelState([{ broadcasterUserId: id, isLive: false }])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await row.click()
    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)

    await expect(
      modal.getByRole("button", { name: "Alert me when" }).count(),
    ).resolves.toBe(0)
    await expect(
      modal.getByRole("button", { name: "Alert on" }).count(),
    ).resolves.toBe(0)
  })

  it("should not offer the live-category suggestion once that category is already saved", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("suggest_saved")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "savedstreamer",
        broadcasterDisplayName: "SavedStreamer",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: id,
        isLive: true,
        categoryId: "509658",
        categoryName: "Just Chatting",
        viewerCount: 10,
      },
    ])
    await seedPreferences({
      channel: [
        {
          broadcasterUserId: id,
          categoryId: "509658",
          categoryName: "Just Chatting",
        },
      ],
    })

    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await row.click()
    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)

    await expect(
      modal.getByRole("button", { name: "Alert me when" }).count(),
    ).resolves.toBe(0)
    await expectVisible(modal.getByRole("button", { name: "Alert on" }))
  })

  it("should offer to enable push after using the live-category suggestion while not enabled", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("suggest_push")
    await mockPushEnvironment(authenticatedSession.page)
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "pushstreamer",
        broadcasterDisplayName: "PushStreamer",
      },
    ])
    await seedChannelState([
      {
        broadcasterUserId: id,
        isLive: true,
        categoryId: "509658",
        categoryName: "Just Chatting",
        viewerCount: 10,
      },
    ])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await row.click()
    const modal = page.getByTestId("channel-detail-modal")
    await expectVisible(modal)

    await modal.getByRole("button", { name: "Alert me when" }).click()

    // The push prompt is a toast, rendered outside the modal.
    await expectVisible(
      page.getByText("Enable notifications so you don't miss this alert."),
    )
  })

  describe("auto-sync on load and resume", () => {
    function offlineChannel(suffix: string, displayName: string) {
      return {
        broadcaster_user_id: broadcasterId(suffix),
        broadcaster_login: displayName.toLowerCase(),
        broadcaster_display_name: displayName,
        broadcaster_profile_image_url: null,
        followed_at: "2024-01-01T00:00:00Z",
        is_live: false,
        stream_id: null,
        category_id: null,
        category_name: null,
        title: null,
        thumbnail_url: null,
        viewer_count: null,
        started_at: null,
      }
    }

    function fulfillJson(body: unknown, status = 200) {
      return {
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      }
    }

    it("should hold the skeleton until the auto-sync lands when the last sync is stale", async ({
      authenticatedSession,
    }) => {
      // Same user row as the fixture's session; only the sync stamp changes.
      await seedAuthenticatedUser({ lastFollowSyncAt: null })
      const { page } = authenticatedSession
      let syncCalls = 0
      await page.route("**/api/channels/followed", (route) =>
        route.fulfill(
          fulfillJson({ data: [offlineChannel("d1_stale", "D1Stale")] }),
        ),
      )
      await page.route("**/api/sync/follows", async (route) => {
        syncCalls++
        await new Promise((resolve) => setTimeout(resolve, 800))
        await route.fulfill(
          fulfillJson({ data: [offlineChannel("synced", "SyncedStreamer")] }),
        )
      })

      await page.goto(WEB_URL)

      await expectVisible(page.locator('[data-slot="skeleton"]').first())
      await expectVisible(page.getByText("SyncedStreamer"))
      expect(await page.getByText("D1Stale").count()).toBe(0)
      expect(syncCalls).toBe(1)
    })

    it("should fall back to D1 data with a notice when the auto-sync fails", async ({
      authenticatedSession,
    }) => {
      await seedAuthenticatedUser({ lastFollowSyncAt: null })
      const { page } = authenticatedSession
      await page.route("**/api/channels/followed", (route) =>
        route.fulfill(
          fulfillJson({ data: [offlineChannel("d1_fallback", "D1Fallback")] }),
        ),
      )
      await page.route("**/api/sync/follows", (route) =>
        route.fulfill(
          fulfillJson(
            {
              error: {
                code: "twitch_unavailable",
                message: "boom",
                requestId: "test",
              },
            },
            502,
          ),
        ),
      )

      await page.goto(WEB_URL)

      await expectVisible(page.getByText("D1Fallback"))
      await expectVisible(
        page.getByText("Couldn't refresh. Showing last synced data."),
      )
    })

    it("should not auto-sync on load when the last sync is fresh, but should on resume once stale", async ({
      authenticatedSession,
    }) => {
      const { page } = authenticatedSession
      let syncCalls = 0
      await page.route("**/api/channels/followed", (route) =>
        route.fulfill(
          fulfillJson({ data: [offlineChannel("fresh", "FreshStreamer")] }),
        ),
      )
      await page.route("**/api/sync/follows", (route) => {
        syncCalls++
        return route.fulfill(
          fulfillJson({ data: [offlineChannel("resumed", "ResumedStreamer")] }),
        )
      })
      await page.clock.install()

      await page.goto(WEB_URL)
      await expectVisible(page.getByText("FreshStreamer"))
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      expect(syncCalls).toBe(0)

      await page.clock.fastForward("31:00")
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))

      await expectVisible(page.getByText("ResumedStreamer"))
      expect(syncCalls).toBe(1)
    })
  })
})
