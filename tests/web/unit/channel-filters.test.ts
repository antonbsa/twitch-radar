import { describe, expect, it } from "vitest"
import {
  applyChannelFilters,
  DEFAULT_CHANNEL_FILTERS,
  deriveLiveCategories,
} from "../../../apps/web/src/lib/channel-filters"
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
  it("should return distinct category names from live channels only", () => {
    const channels = [
      channel({
        broadcaster_user_id: "1",
        is_live: true,
        category_name: "Just Chatting",
      }),
      channel({
        broadcaster_user_id: "2",
        is_live: true,
        category_name: "Music",
      }),
      channel({
        broadcaster_user_id: "3",
        is_live: true,
        category_name: "Just Chatting",
      }),
      channel({
        broadcaster_user_id: "4",
        is_live: false,
        category_name: "Art",
      }),
      channel({ broadcaster_user_id: "5", is_live: true, category_name: null }),
    ]

    expect(deriveLiveCategories(channels)).toEqual(["Just Chatting", "Music"])
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

  it("should hide the offline section when liveFilter is 'live'", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      liveFilter: "live",
    })
    expect(result.offline).toEqual([])
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual([
      "high",
      "low",
    ])
  })

  it("should narrow the live section by category without affecting offline", () => {
    const result = applyChannelFilters(channels, {
      ...DEFAULT_CHANNEL_FILTERS,
      category: "Music",
    })
    expect(result.live.map((c) => c.broadcaster_user_id)).toEqual(["low"])
    expect(result.offline.map((c) => c.broadcaster_user_id)).toEqual([
      "apple",
      "zebra",
    ])
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
