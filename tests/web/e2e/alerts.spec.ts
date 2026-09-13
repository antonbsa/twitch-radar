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

  it("should open the add-category sheet and dismiss it on tap outside", async ({
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

    // Tap outside (the overlay behind the sheet) to dismiss.
    await page
      .locator('[data-slot="sheet-overlay"]')
      .click({ position: { x: 5, y: 5 } })
    await expectHidden(dialog)
  })

  it("should add and remove a global category preference end to end", async ({
    authenticatedSession,
  }) => {
    const { page } = authenticatedSession
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

    await dialog.getByPlaceholder("Search categories...").fill("mine")
    await dialog.getByRole("button", { name: "Minecraft" }).click()

    // The sheet closes on success and the refreshed list shows the new alert.
    await expectHidden(dialog)
    await expectVisible(page.getByText("Minecraft"))
    await expectHidden(page.getByText("No global alerts set."))

    const removeButton = page.getByRole("button", { name: "Remove Minecraft" })
    await removeButton.click()
    // First click only arms the chip — a second click is required to
    // actually remove it.
    await expectVisible(page.locator('[data-confirming="true"]'))
    await expectVisible(page.getByText("Minecraft"))

    await removeButton.click()
    await expectVisible(page.getByText("No global alerts set."))
    await expectHidden(page.getByText("Minecraft"))
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

    await expectVisible(page.getByRole("heading", { name: "All channels" }))
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
    await dialog.getByPlaceholder("Search categories...").fill("mine")

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

    await page.getByRole("button", { name: "Add channel" }).click()
    const picker = page.getByRole("dialog")
    await expectVisible(picker)
    await expectVisible(picker.getByText("Add channel"))

    await picker.getByRole("button", { name: "FreshStreamer" }).click()

    // The picker hands off to the per-channel sheet. Assert on each sheet's
    // own placeholder rather than on `getByRole("dialog")`: while the picker
    // plays its close animation both dialogs are briefly in the DOM, and a
    // two-element match is a strict-mode violation, not a pass.
    await expectHidden(page.getByPlaceholder("Search channels..."))
    await expectVisible(page.getByPlaceholder("Search categories..."))

    await page.getByPlaceholder("Search categories...").fill("mine")
    await page.getByRole("button", { name: "Minecraft" }).click()

    const card = page.locator(
      '[data-testid="channel-alerts-card"][data-display-name="FreshStreamer"]',
    )
    await expectVisible(card)
    await expectVisible(card.getByText("Minecraft"))
  })
})
