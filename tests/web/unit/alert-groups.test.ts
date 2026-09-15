import { describe, expect, it } from "vitest"
import {
  buildChannelAlertGroups,
  filterChannelAlertGroups,
  type ChannelAlertGroup,
} from "../../../apps/web/src/lib/alert-groups"
import type { ChannelPreference } from "../../../apps/web/src/types/preference"
import type { FollowedChannel } from "../../../apps/web/src/types/channel"

function pref(
  overrides: Partial<ChannelPreference> & {
    id: string
    broadcaster_user_id: string
    category_id: string
    category_name: string
  },
): ChannelPreference {
  return { created_at: "2026-01-01T00:00:00.000Z", ...overrides }
}

function channel(
  overrides: Partial<FollowedChannel> & { broadcaster_user_id: string },
): FollowedChannel {
  return {
    broadcaster_login: "login",
    broadcaster_display_name: "Display",
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

describe("buildChannelAlertGroups", () => {
  it("should collapse several preferences for one channel into a single group", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "1",
          category_id: "c2",
          category_name: "Minecraft",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "1",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({
          broadcaster_user_id: "1",
          broadcaster_display_name: "Alanzoka",
        }),
      ],
      [],
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].displayName).toBe("Alanzoka")
    expect(groups[0].categories.map((c) => c.categoryName)).toEqual([
      "GTA V",
      "Minecraft",
    ])
  })

  it("should carry the channel's avatar, live flag, and viewer count onto the group", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "1",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({
          broadcaster_user_id: "1",
          broadcaster_display_name: "Alanzoka",
          broadcaster_profile_image_url: "https://example.test/a.png",
          is_live: true,
          viewer_count: 4200,
        }),
      ],
      [],
    )

    expect(groups[0]).toMatchObject({
      profileImageUrl: "https://example.test/a.png",
      isLive: true,
      viewerCount: 4200,
      isUnsynced: false,
    })
  })

  it("should flag a category that an active global preference also covers", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "1",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "1",
          category_id: "c2",
          category_name: "Just Chatting",
        }),
      ],
      [channel({ broadcaster_user_id: "1" })],
      ["c2"],
    )

    expect(
      groups[0].categories.map((c) => [c.categoryName, c.alsoGlobal]),
    ).toEqual([
      ["GTA V", false],
      ["Just Chatting", true],
    ])
  })

  it("should order live channels before offline ones", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "offline",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "live",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({
          broadcaster_user_id: "offline",
          broadcaster_display_name: "Aaa",
          is_live: false,
        }),
        channel({
          broadcaster_user_id: "live",
          broadcaster_display_name: "Zzz",
          is_live: true,
          viewer_count: 1,
        }),
      ],
      [],
    )

    expect(groups.map((g) => g.displayName)).toEqual(["Zzz", "Aaa"])
  })

  it("should order live channels by viewer count descending, treating null as zero", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "a",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "b",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p3",
          broadcaster_user_id: "c",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({
          broadcaster_user_id: "a",
          broadcaster_display_name: "Low",
          is_live: true,
          viewer_count: 10,
        }),
        channel({
          broadcaster_user_id: "b",
          broadcaster_display_name: "None",
          is_live: true,
          viewer_count: null,
        }),
        channel({
          broadcaster_user_id: "c",
          broadcaster_display_name: "High",
          is_live: true,
          viewer_count: 900,
        }),
      ],
      [],
    )

    expect(groups.map((g) => g.displayName)).toEqual(["High", "Low", "None"])
  })

  it("should order offline channels by display name ascending, case-insensitively", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "a",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "b",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({ broadcaster_user_id: "a", broadcaster_display_name: "zeta" }),
        channel({
          broadcaster_user_id: "b",
          broadcaster_display_name: "Alpha",
        }),
      ],
      [],
    )

    expect(groups.map((g) => g.displayName)).toEqual(["Alpha", "zeta"])
  })

  it("should sort unsynced channels last and fall back to the raw broadcaster id", () => {
    const groups = buildChannelAlertGroups(
      [
        pref({
          id: "p1",
          broadcaster_user_id: "ghost",
          category_id: "c1",
          category_name: "GTA V",
        }),
        pref({
          id: "p2",
          broadcaster_user_id: "known",
          category_id: "c1",
          category_name: "GTA V",
        }),
      ],
      [
        channel({
          broadcaster_user_id: "known",
          broadcaster_display_name: "Known",
        }),
      ],
      [],
    )

    expect(groups.map((g) => [g.displayName, g.isUnsynced])).toEqual([
      ["Known", false],
      ["ghost", true],
    ])
  })

  it("should return an empty array when there are no channel preferences", () => {
    expect(
      buildChannelAlertGroups(
        [],
        [channel({ broadcaster_user_id: "1" })],
        ["c1"],
      ),
    ).toEqual([])
  })
})

function group(
  overrides: Partial<ChannelAlertGroup> & { displayName: string },
): ChannelAlertGroup {
  return {
    broadcasterUserId: overrides.displayName,
    profileImageUrl: null,
    isLive: false,
    viewerCount: null,
    isUnsynced: false,
    categories: [],
    ...overrides,
  }
}

describe("filterChannelAlertGroups", () => {
  it("should return every group unchanged for an empty query", () => {
    const groups = [
      group({ displayName: "Alanzoka" }),
      group({ displayName: "Gaules" }),
    ]
    expect(filterChannelAlertGroups(groups, "")).toEqual(groups)
  })

  it("should return every group unchanged for a whitespace-only query", () => {
    const groups = [group({ displayName: "Alanzoka" })]
    expect(filterChannelAlertGroups(groups, "   ")).toEqual(groups)
  })

  it("should match a case-insensitive substring of the display name", () => {
    const groups = [
      group({ displayName: "Alanzoka" }),
      group({ displayName: "Gaules" }),
    ]
    expect(
      filterChannelAlertGroups(groups, "ALAN").map((g) => g.displayName),
    ).toEqual(["Alanzoka"])
  })

  it("should return an empty array when nothing matches", () => {
    const groups = [group({ displayName: "Alanzoka" })]
    expect(filterChannelAlertGroups(groups, "xyz")).toEqual([])
  })
})
