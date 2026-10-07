import { describe, expect, it } from "vitest"
import {
  applyChannelFilters,
  DEFAULT_CHANNEL_FILTERS,
  deriveLiveCategories,
} from "../../../apps/web/src/routes/channels/channel-filters"
import type { FollowedChannel } from "../../../apps/web/src/types/channel"

function channel(overrides: Partial<FollowedChannel> = {}): FollowedChannel {
  return {
    broadcaster_user_id: "1",
    broadcaster_login: "streamer",
    broadcaster_display_name: "Streamer",
    broadcaster_profile_image_url: null,
    followed_at: null,
    is_live: false,
    stream_id: null,
    category_id: null,
    category_name: null,
    title: null,
    viewer_count: null,
    started_at: null,
    ...overrides,
  }
}

describe("deriveLiveCategories", () => {
  it("should count live channels per category, ordered by count then alphabetically", () => {
    const channels = [
      channel({
        broadcaster_user_id: "1",
        is_live: true,
        category_name: "Music",
      }),
      channel({
        broadcaster_user_id: "2",
        is_live: true,
        category_name: "Just Chatting",
      }),
      channel({
        broadcaster_user_id: "3",
        is_live: true,
        category_name: "Music",
      }),
      channel({
        broadcaster_user_id: "4",
        is_live: false,
        category_name: "Art",
      }),
      channel({ broadcaster_user_id: "5", is_live: true, category_name: null }),
      channel({
        broadcaster_user_id: "6",
        is_live: true,
        category_name: "Art",
      }),
    ]

    expect(deriveLiveCategories(channels)).toEqual([
      { name: "Music", liveCount: 2, hasAlert: false },
      { name: "Art", liveCount: 1, hasAlert: false },
      { name: "Just Chatting", liveCount: 1, hasAlert: false },
    ])
  })

  it("should flag a category when any of its live channels has an alert", () => {
    const channels = [
      channel({
        broadcaster_user_id: "1",
        is_live: true,
        category_name: "Music",
      }),
      channel({
        broadcaster_user_id: "2",
        is_live: true,
        category_name: "Music",
      }),
      channel({
        broadcaster_user_id: "3",
        is_live: true,
        category_name: "Art",
      }),
    ]

    const result = deriveLiveCategories(
      channels,
      (c) => c.broadcaster_user_id === "2",
    )
    expect(result.map((c) => [c.name, c.hasAlert])).toEqual([
      ["Music", true],
      ["Art", false],
    ])
  })
})

describe("applyChannelFilters", () => {
  const zebra = channel({
    broadcaster_user_id: "zebra",
    broadcaster_login: "zebra",
    broadcaster_display_name: "Zebra",
    is_live: false,
  })
  const apple = channel({
    broadcaster_user_id: "apple",
    broadcaster_login: "apple",
    broadcaster_display_name: "Apple",
    is_live: false,
  })
  const highViewer = channel({
    broadcaster_user_id: "high",
    broadcaster_login: "highviewer",
    broadcaster_display_name: "HighViewer",
    is_live: true,
    viewer_count: 5000,
    category_name: "Just Chatting",
  })
  const lowViewer = channel({
    broadcaster_user_id: "low",
    broadcaster_login: "lowviewer",
    broadcaster_display_name: "LowViewer",
    is_live: true,
    viewer_count: 100,
    category_name: "Music",
  })
  const channels = [zebra, apple, highViewer, lowViewer]

  it("should default to live sorted by viewer count desc and offline by name asc", () => {
    const result = applyChannelFilters(channels, DEFAULT_CHANNEL_FILTERS)
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual([
      "high",
      "low",
    ])
    expect(result.offline.map((c) => c.broadcaster_user_id)).toEqual([
      "apple",
      "zebra",
    ])
  })

  it("should filter by search substring across display name and login, case-insensitively", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      search: "ZEB",
    })
    expect(result.offline.map((c) => c.broadcaster_user_id)).toEqual(["zebra"])
    expect(result.live).toEqual([])
  })

  it("should narrow the live section to a single selected category without affecting offline", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      categories: ["Music"],
    })
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual(["low"])
    expect(result.offline.map((c) => c.broadcaster_user_id)).toEqual([
      "apple",
      "zebra",
    ])
  })

  it("should narrow the live section to any of multiple selected categories", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      categories: ["Music", "Just Chatting"],
    })
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual([
      "high",
      "low",
    ])
  })

  it("should narrow the live section to categories with an active alert", () => {
    const result = applyChannelFilters(
      channels,
      { ...DEFAULT_CHANNEL_FILTERS, alertsOnly: true },
      (c) => c.broadcaster_user_id === "low",
    )
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual(["low"])
  })

  it("should show no live channels when alerts-only is on and no category has an alert", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      alertsOnly: true,
    })
    expect(result.live).toEqual([])
  })

  it("should sort alphabetically across both sections when sort is 'alphabetical'", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      sort: "alphabetical",
    })
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual([
      "high",
      "low",
    ])
    expect(result.offline.map((c) => c.broadcaster_user_id)).toEqual([
      "apple",
      "zebra",
    ])
  })

  it("should return no results when search matches nothing", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      search: "nonexistent",
    })
    expect(result.live).toEqual([])
    expect(result.offline).toEqual([])
  })
})
