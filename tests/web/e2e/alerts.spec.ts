import { afterAll, beforeAll, describe, expect } from "vitest"
import {
  E2E_BROADCASTER_PREFIX,
  resetState,
  seedChannelState,
  seedFollowedChannels,
  seedPreferences,
} from "./orchestrator/test-seam-client"
import { WEB_URL } from "./setup/browser"
import { it } from "./setup/fixtures"
import { expectHidden, expectVisible } from "./setup/assertions"
import {
  mockNotificationPermission,
  mockPushEnvironment,
} from "./setup/push-mocks"

function broadcasterId(suffix: string): string {
  return `${E2E_BROADCASTER_PREFIX}alerts_${suffix}`
}

describe("Alerts view", () => {
  beforeAll(async () => {
    await resetState()
  })

  afterAll(async () => {
    await resetState()
  })

  it("should show the empty state when there are no global alerts", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No global alerts set."))
  })

  it("should surface the error state quickly when preferences fail to load (no 4xx retry)", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "not_found", message: "Route not found" },
        }),
      }),
    )
    await page.goto(`${WEB_URL}/alerts`)

    await expectVisible(
      page.getByText("Failed to load alerts. Try again later."),
      2000,
    )
  })

  it("should open the add-category dialog full-screen and dismiss it with the close button", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page.getByRole("button", { name: "Add global category" }).click()

    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await expectVisible(dialog.getByText("Add Category"))

    // Full-screen on every viewport (#20): no overlay is left exposed to tap,
    // so the close button is the dismiss path.
    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(box).toEqual({
      x: 0,
      y: 0,
      width: viewport?.width,
      height: viewport?.height,
    })

    await dialog.getByRole("button", { name: "Close" }).click()
    await expectHidden(dialog)
  })

  it("should open the add-category dialog as a centered, size-constrained dialog on desktop and dismiss it by clicking outside", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page.getByRole("button", { name: "Add global category" }).click()

    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await expectVisible(dialog.getByText("Add Category"))

    // Smaller than the page behind it, centered, with the overlay left to
    // click (#40).
    await expect
      .poll(async () => (await dialog.boundingBox())?.width)
      .toBeLessThanOrEqual(512)
    const box = await dialog.boundingBox()
    expect(box?.height).toBeLessThan(800)
    expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBeCloseTo(640, 0)

    await page.mouse.click(10, 10)
    await expectHidden(dialog)
  })

  it("should add and remove a global category preference end to end", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    // Headless Chromium's default notification permission in this tier is
    // "denied" (not "default"/undecided) — mock the undecided state
    // explicitly so this exercises the "not enabled yet" prompt copy the
    // test asserts on, not the "blocked" one.
    await mockNotificationPermission(page, "default")
    // Only category search is mocked — this tier has no mock Twitch server
    // and search proxies to the real Twitch API. The preference add/remove
    // round-trips below hit the real backend (the seeded E2E user has no
    // followed channels, so no monitoring work reaches Twitch either).
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "27471", name: "Minecraft", box_art_url: null }],
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No global alerts set."))

    await page.getByRole("button", { name: "Add global category" }).click()
    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)

    await dialog.getByPlaceholder("Search categories").fill("mine")
    await dialog.getByRole("button", { name: "Minecraft" }).click()

    // The sheet closes on success and the refreshed list shows the new
    // alert; push isn't enabled in this test, so an enable-push toast also
    // surfaces (rendered outside the sheet, so it doesn't need to stay open).
    await expectHidden(dialog)
    await expectVisible(
      page.getByText("Enable notifications so you don't miss this alert."),
    )
    await expectVisible(page.getByText("Minecraft"))
    await expectHidden(page.getByText("No global alerts set."))
    // The push prompt takes over the "Alert saved." toast's slot (#24).
    expect(await page.locator("[data-sonner-toast]").count()).toBe(1)
    expect(await page.getByText("Alert saved.").count()).toBe(0)

    const removeButton = page.getByRole("button", { name: "Remove Minecraft" })
    await removeButton.click()
    // First click only arms the chip — a second click is required to
    // actually remove it.
    await expectVisible(page.locator('[data-confirming="true"]'))
    await expectVisible(page.getByText("Minecraft"))

    await removeButton.click()
    await expectVisible(page.getByText("No global alerts set."))
    await expectHidden(page.getByText("Minecraft"))
    // The removal toast replaces the prompt in the same slot without
    // inheriting its Enable action.
    await expectVisible(page.getByText("Alert removed."))
    expect(await page.locator("[data-sonner-toast]").count()).toBe(1)
    expect(await page.getByRole("button", { name: "Enable" }).count()).toBe(0)
  })

  it("should show an error toast and keep the dialog open when adding a category fails", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "27471", name: "Minecraft", box_art_url: null }],
        }),
      }),
    )
    await page.route("**/api/preferences/global", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "internal_error",
            message: "boom",
            requestId: "req_e2e",
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page.getByRole("button", { name: "Add global category" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder("Search categories").fill("mine")
    await dialog.getByRole("button", { name: "Minecraft" }).click()

    await expectVisible(page.getByText("Could not save the alert. Try again."))
    await expectVisible(dialog)
    expect(await page.getByText("Alert saved.").count()).toBe(0)
  })

  // These two run before any test below seeds followed channels: adding a
  // global preference re-evaluates monitoring for every followed broadcaster
  // (ADR 0007), and with the E2E user's follows piling up across this
  // no-per-test-reset describe block, that real Twitch round-trip starts
  // failing once enough test-fixture broadcasters exist.
  it("should show an enable-push toast after adding a category while not enabled", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockPushEnvironment(page)
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "509658", name: "Just Chatting", box_art_url: null }],
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page.getByRole("button", { name: "Add global category" }).click()
    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)

    await dialog.getByPlaceholder("Search categories").fill("just")
    await dialog.getByRole("button", { name: "Just Chatting" }).click()

    // The sheet closes on success as before (#29) — the push prompt is a
    // toast, rendered outside the sheet, so it doesn't need to stay open.
    await expectHidden(dialog)
    const prompt = page.getByText(
      "Enable notifications so you don't miss this alert.",
    )
    await expectVisible(prompt)
    await page.getByRole("button", { name: "Enable" }).click()

    // Clean up so this test's state doesn't leak into the next one (this
    // describe block only resets in beforeAll/afterAll, not between tests).
    const removeButton = page.getByRole("button", {
      name: "Remove Just Chatting",
    })
    await removeButton.click()
    await removeButton.click()
    await expectHidden(page.getByText("Just Chatting"))
  })

  it("should not prompt to enable push when it is already enabled", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await mockPushEnvironment(page)
    // A different category than the previous test's, so this test doesn't
    // depend on that test's cleanup having run first.
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "26936", name: "Music", box_art_url: null }],
        }),
      }),
    )

    // Enable push for real via the Account tab before exercising the flow
    // under test, so the add-category mutation below sees status "enabled".
    // Switch tabs via the in-app nav (client-side route change), not
    // page.goto — a real browser navigation re-runs the mocked Push API's
    // init script from scratch, resetting its in-memory subscription and
    // making push look "not enabled" again on the next page.
    await page.goto(`${WEB_URL}/account`)
    await page.getByRole("button", { name: "Enable Notifications" }).click()
    await expectVisible(page.getByText("Status: Enabled"))

    await page.getByRole("link", { name: "Alerts" }).click()
    await page.getByRole("button", { name: "Add global category" }).click()
    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)

    await dialog.getByPlaceholder("Search categories").fill("music")
    await dialog.getByRole("button", { name: "Music" }).click()

    // No prompt — the sheet closes on success exactly as before #29, and
    // the plain success toast stays.
    await expectHidden(dialog)
    await expectVisible(page.getByText("Music"))
    await expectVisible(page.getByText("Alert saved."))
    expect(
      await page
        .getByText("Enable notifications so you don't miss this alert.")
        .count(),
    ).toBe(0)
  })

  it("should show both section empty states without any tab navigation", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)

    await expectVisible(page.getByRole("heading", { name: "Global" }))
    await expectVisible(page.getByText("No global alerts set."))
    await expectVisible(page.getByRole("heading", { name: "Per channel" }))
    await expectVisible(page.getByText("No per-channel alerts set."))
    expect(await page.getByRole("tab").count()).toBe(0)
  })

  it("should group a channel's categories into one card and remove one of them", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("grouped")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "groupedstreamer",
        broadcasterDisplayName: "GroupedStreamer",
      },
    ])

    const { page } = authenticatedSession
    let gtaRemoved = false

    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_minecraft",
                broadcaster_user_id: id,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
              ...(gtaRemoved
                ? []
                : [
                    {
                      id: "pref_gta",
                      broadcaster_user_id: id,
                      category_id: "32982",
                      category_name: "GTA V",
                      created_at: new Date().toISOString(),
                    },
                  ]),
            ],
            global: [],
          },
        }),
      }),
    )
    await page.route("**/api/preferences/channel/pref_gta", (route) => {
      gtaRemoved = true
      return route.fulfill({ status: 204, body: "" })
    })

    await page.goto(`${WEB_URL}/alerts`)

    // One card, one name, both categories.
    await expectVisible(page.getByText("GroupedStreamer"))
    expect(await page.getByText("GroupedStreamer").count()).toBe(1)
    await expectVisible(page.getByText("GTA V"))
    await expectVisible(page.getByText("Minecraft"))

    const removeGta = page.getByRole("button", {
      name: "Remove GTA V for GroupedStreamer",
    })
    await removeGta.click()
    await removeGta.click()

    await expectHidden(page.getByText("GTA V"))
    await expectVisible(page.getByText("Minecraft"))
    await expectVisible(page.getByText("GroupedStreamer"))
    await expectVisible(page.getByText("Alert removed."))
  })

  it("should mark a per-channel category that an active global preference also covers", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("overlap")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "overlapstreamer",
        broadcasterDisplayName: "OverlapStreamer",
      },
    ])

    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_overlap",
                broadcaster_user_id: id,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
            ],
            global: [
              {
                id: "glob_overlap",
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
                exclusions: [],
              },
            ],
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)

    await expectVisible(page.getByText("Also in All channels"))
    // Still removable despite the marker.
    await expectVisible(
      page.getByRole("button", {
        name: "Remove Minecraft for OverlapStreamer",
      }),
    )
  })

  it("should sort live channels above offline ones", async ({
    authenticatedSession,
  }) => {
    const liveId = broadcasterId("sortlive")
    const offlineId = broadcasterId("sortoffline")
    await seedFollowedChannels([
      {
        broadcasterUserId: offlineId,
        broadcasterLogin: "aaaoffline",
        broadcasterDisplayName: "AaaOffline",
      },
      {
        broadcasterUserId: liveId,
        broadcasterLogin: "zzzlive",
        broadcasterDisplayName: "ZzzLive",
      },
    ])
    await seedChannelState([
      { broadcasterUserId: offlineId, isLive: false },
      { broadcasterUserId: liveId, isLive: true, viewerCount: 100 },
    ])

    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_offline",
                broadcaster_user_id: offlineId,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
              {
                id: "pref_live",
                broadcaster_user_id: liveId,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
            ],
            global: [],
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("ZzzLive"))

    const names = await page
      .locator('[data-testid="channel-alerts-card"]')
      .evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-display-name")),
      )
    expect(names).toEqual(["ZzzLive", "AaaOffline"])
  })

  it("should label a globally-covered category in search without disabling it", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("searchlabel")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "labelstreamer",
        broadcasterDisplayName: "LabelStreamer",
      },
    ])

    const { page } = authenticatedSession
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "27471", name: "Minecraft", box_art_url: null }],
        }),
      }),
    )
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_other",
                broadcaster_user_id: id,
                category_id: "32982",
                category_name: "GTA V",
                created_at: new Date().toISOString(),
              },
            ],
            global: [
              {
                id: "glob_mc",
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
                exclusions: [],
              },
            ],
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await page
      .getByRole("button", { name: "Add category for LabelStreamer" })
      .click()

    const dialog = page.getByRole("dialog")
    await expectVisible(dialog)
    await dialog.getByPlaceholder("Search categories").fill("mine")

    const result = dialog.getByRole("button", { name: /Minecraft/ })
    await expectVisible(result)
    await expectVisible(dialog.getByText("already in All channels"))
    // Labelled, but still selectable — pinning per-channel is deliberate.
    expect(await result.isEnabled()).toBe(true)
  })

  it("should add a category to a channel that has no preferences yet", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("newchannel")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "freshstreamer",
        broadcasterDisplayName: "FreshStreamer",
      },
    ])

    const { page } = authenticatedSession
    let categoryAdded = false

    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: categoryAdded
              ? [
                  {
                    id: "pref_minecraft",
                    broadcaster_user_id: id,
                    category_id: "27471",
                    category_name: "Minecraft",
                    created_at: new Date().toISOString(),
                  },
                ]
              : [],
            global: [],
          },
        }),
      }),
    )
    await page.route("**/api/preferences/channel", (route) => {
      categoryAdded = true
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "pref_minecraft",
            user_id: "e2e-user",
            broadcaster_user_id: id,
            category_id: "27471",
            category_name: "Minecraft",
            created_at: new Date().toISOString(),
            disabled_at: null,
          },
        }),
      })
    })
    await page.route("**/api/categories/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "27471", name: "Minecraft", box_art_url: null }],
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No per-channel alerts set."))

    await page.getByRole("button", { name: "Add channel", exact: true }).click()
    const picker = page.getByRole("dialog")
    await expectVisible(picker)
    await expectVisible(picker.getByText("Add channel"))

    await picker.getByRole("button", { name: "FreshStreamer" }).click()

    // Both dialogs briefly exist during close animation, so assert on unique content
    await expectHidden(page.getByText("Add channel"))
    await expectVisible(page.getByPlaceholder("Search categories"))

    await page.getByPlaceholder("Search categories").fill("mine")
    await page.getByRole("button", { name: "Minecraft" }).click()

    const card = page.locator(
      '[data-testid="channel-alerts-card"][data-display-name="FreshStreamer"]',
    )
    await expectVisible(card)
    await expectVisible(card.getByText("Minecraft"))
  })

  it("should only ever arm one chip for removal at a time, across both sections", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("singlearm")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "singlearmstreamer",
        broadcasterDisplayName: "SingleArmStreamer",
      },
    ])

    const { page } = authenticatedSession
    let gtaRemoved = false

    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: gtaRemoved
              ? []
              : [
                  {
                    id: "pref_singlearm",
                    broadcaster_user_id: id,
                    category_id: "32982",
                    category_name: "GTA V",
                    created_at: new Date().toISOString(),
                  },
                ],
            global: [
              {
                id: "glob_singlearm",
                category_id: "509658",
                category_name: "Just Chatting",
                created_at: new Date().toISOString(),
                exclusions: [],
              },
            ],
          },
        }),
      }),
    )
    await page.route("**/api/preferences/channel/pref_singlearm", (route) => {
      gtaRemoved = true
      return route.fulfill({ status: 204, body: "" })
    })

    await page.goto(`${WEB_URL}/alerts`)

    const globalChip = page.getByRole("button", {
      name: "Remove Just Chatting",
    })
    const channelChip = page.getByRole("button", {
      name: "Remove GTA V for SingleArmStreamer",
    })

    await globalChip.click()
    await expectVisible(page.locator('[data-confirming="true"]'))
    expect(await page.locator('[data-confirming="true"]').count()).toBe(1)

    // Arming the per-channel chip disarms the global one — only one chip is
    // ever armed across the whole page, not one per section.
    await channelChip.click()
    expect(await page.locator('[data-confirming="true"]').count()).toBe(1)
    expect(await channelChip.getAttribute("data-confirming")).toBe("true")
    expect(await globalChip.getAttribute("data-confirming")).toBeNull()

    // The newly-armed chip still confirms normally on a second click.
    await channelChip.click()
    await expectHidden(page.getByText("GTA V"))
    await expectVisible(page.getByText("Just Chatting"))
  })

  it("should filter per-channel cards by the channel search input", async ({
    authenticatedSession,
  }) => {
    const matchId = broadcasterId("searchmatch")
    const otherId = broadcasterId("searchother")
    await seedFollowedChannels([
      {
        broadcasterUserId: matchId,
        broadcasterLogin: "alanzoka",
        broadcasterDisplayName: "Alanzoka",
      },
      {
        broadcasterUserId: otherId,
        broadcasterLogin: "gaules",
        broadcasterDisplayName: "Gaules",
      },
    ])

    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_search_match",
                broadcaster_user_id: matchId,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
              {
                id: "pref_search_other",
                broadcaster_user_id: otherId,
                category_id: "32982",
                category_name: "GTA V",
                created_at: new Date().toISOString(),
              },
            ],
            global: [],
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("Alanzoka"))
    await expectVisible(page.getByText("Gaules"))

    const search = page.getByRole("textbox", { name: "Search channels" })
    await search.fill("alan")
    await expectVisible(page.getByText("Alanzoka"))
    await expectHidden(page.getByText("Gaules"))

    // The clear button appears once there's text, and restores the full list.
    await page.getByRole("button", { name: "Clear search" }).click()
    await expectVisible(page.getByText("Alanzoka"))
    await expectVisible(page.getByText("Gaules"))
  })

  it("should show a no-matches message when the channel search matches nothing", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("searchnomatch")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "nomatchstreamer",
        broadcasterDisplayName: "NoMatchStreamer",
      },
    ])

    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: [
              {
                id: "pref_nomatch",
                broadcaster_user_id: id,
                category_id: "27471",
                category_name: "Minecraft",
                created_at: new Date().toISOString(),
              },
            ],
            global: [],
          },
        }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("NoMatchStreamer"))

    const search = page.getByRole("textbox", { name: "Search channels" })
    await search.fill("zzz-does-not-exist")

    await expectHidden(page.getByText("NoMatchStreamer"))
    await expectVisible(page.getByText("No channels match your search."))
    // Distinct from the zero-preferences empty state.
    await expectHidden(page.getByText("No per-channel alerts set."))
  })

  it("should not show the channel search input when there are no per-channel alerts yet", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.route("**/api/preferences", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { channel: [], global: [] } }),
      }),
    )

    await page.goto(`${WEB_URL}/alerts`)
    await expectVisible(page.getByText("No per-channel alerts set."))
    expect(
      await page.getByRole("textbox", { name: "Search channels" }).count(),
    ).toBe(0)
    // The add-channel affordance stays available even with nothing configured.
    await expectVisible(
      page.getByRole("button", { name: "Add channel", exact: true }),
    )
  })

  it("should pause and resume all notifications, keeping the description while paused", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
    await page.goto(`${WEB_URL}/alerts`)

    const toggle = page.getByRole("switch", {
      name: "Pause all notifications",
    })
    await expectVisible(toggle)
    expect(await page.getByTestId("pause-description").count()).toBe(0)

    await toggle.click()
    await expectVisible(page.getByTestId("pause-description"))

    // The paused state is persisted, not just local: it survives a reload.
    await page.reload()
    await expectVisible(page.getByTestId("pause-description"))

    await page.getByRole("switch", { name: "Pause all notifications" }).click()
    await expectHidden(page.getByTestId("pause-description"))
  })

  it("should mute a channel from its detail modal and unmute it from the Alerts page", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("mute")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "mutestreamer",
        broadcasterDisplayName: "MuteStreamer",
      },
    ])
    await seedChannelState([{ broadcasterUserId: id, isLive: false }])

    const { page } = authenticatedSession
    await page.goto(WEB_URL)
    const row = page.locator(
      `[data-testid="channel-row"][data-broadcaster-user-id="${id}"]`,
    )
    await expectVisible(row)
    expect(await row.getByTestId("muted-indicator").count()).toBe(0)
    await row.click()

    const modal = page.getByTestId("channel-detail-modal")
    await modal.getByRole("button", { name: "Mute channel" }).click()
    await expectVisible(modal.getByRole("button", { name: "Unmute" }))
    await expectVisible(modal.getByTestId("muted-indicator"))
    await expectVisible(page.getByText("MuteStreamer muted"))
    await page.keyboard.press("Escape")
    await expectVisible(row.getByTestId("muted-indicator"))

    await page.goto(`${WEB_URL}/alerts`)
    const muted = page.getByTestId("muted-channels")
    await expectVisible(muted.getByText("MuteStreamer"))
    await muted.getByRole("button", { name: "Unmute MuteStreamer" }).click()
    await expectVisible(page.getByText("No muted channels."))
    await expectVisible(page.getByText("MuteStreamer unmuted"))

    // The add button mutes straight from the picker.
    await muted.getByRole("button", { name: "Add channel to mute" }).click()
    await page.getByRole("button", { name: "MuteStreamer" }).click()
    await expectVisible(muted.getByText("MuteStreamer"))
  })

  it("should add and remove a global category exclusion from the chip's dialog", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("exclusion")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "exclusionstreamer",
        broadcasterDisplayName: "ExclusionStreamer",
      },
    ])
    // Own category: soft-disabled rows from earlier tests keep their unique slot.
    await seedPreferences({
      global: [
        { categoryId: "exclusion_cat", categoryName: "Exclusion Category" },
      ],
    })

    const { page } = authenticatedSession
    await page.goto(`${WEB_URL}/alerts`)
    await page
      .getByRole("button", { name: "Excluded channels for Exclusion Category" })
      .click()

    const dialog = page.getByTestId("exclusions-dialog")
    await expectVisible(dialog.getByText("No channels excluded."))

    await dialog
      .getByRole("button", { name: "Exclude ExclusionStreamer" })
      .click()
    const excluded = dialog.getByTestId("excluded-channels")
    await expectVisible(excluded.getByText("ExclusionStreamer"))

    // Persisted: the exclusion survives a reload.
    await page.reload()
    await page
      .getByRole("button", { name: "Excluded channels for Exclusion Category" })
      .click()
    await expectVisible(
      page.getByTestId("excluded-channels").getByText("ExclusionStreamer"),
    )

    await page
      .getByRole("button", { name: "Stop excluding ExclusionStreamer" })
      .click()
    await expectVisible(page.getByText("No channels excluded."))
  })
  it("should update the exclusions list before the API responds and revert on failure", async ({
    authenticatedSession,
  }) => {
    const id = broadcasterId("optimistic")
    await seedFollowedChannels([
      {
        broadcasterUserId: id,
        broadcasterLogin: "optimisticstreamer",
        broadcasterDisplayName: "OptimisticStreamer",
      },
    ])
    await seedPreferences({
      global: [
        { categoryId: "optimistic_cat", categoryName: "Optimistic Category" },
      ],
    })

    const { page } = authenticatedSession
    await page.goto(`${WEB_URL}/alerts`)
    await page
      .getByRole("button", {
        name: "Excluded channels for Optimistic Category",
      })
      .click()
    const dialog = page.getByTestId("exclusions-dialog")

    // Hold the POST: the row must already be in the excluded list.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      "**/api/preferences/global/*/exclusions",
      async (route) => {
        await held
        await route.continue()
      },
    )
    await dialog
      .getByRole("button", { name: "Exclude OptimisticStreamer" })
      .click()
    await expectVisible(
      dialog.getByTestId("excluded-channels").getByText("OptimisticStreamer"),
    )
    const posted = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" && res.url().includes("/exclusions"),
    )
    release()
    await posted
    await page.unroute("**/api/preferences/global/*/exclusions")

    // A failing DELETE puts the row back once the refetch lands.
    await page.route("**/api/preferences/global/*/exclusions/*", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    )
    await dialog
      .getByRole("button", { name: "Stop excluding OptimisticStreamer" })
      .click()
    await expectVisible(
      dialog.getByTestId("excluded-channels").getByText("OptimisticStreamer"),
    )
  })
})
