import { describe, expect, it } from "vitest"
import { createAlertMatcher } from "../../../apps/web/src/lib/alert-match"
import type { BroadcasterMute } from "../../../apps/web/src/hooks/use-notifications"
import type { FollowedChannel } from "../../../apps/web/src/types/channel"
import type {
  ChannelPreference,
  GlobalPreference,
  PreferencesResponse,
} from "../../../apps/web/src/types/preference"

function channel(overrides: Partial<FollowedChannel> = {}): FollowedChannel {
  return {
    broadcaster_user_id: "b1",
    broadcaster_login: "login",
    broadcaster_display_name: "Display",
    broadcaster_profile_image_url: null,
    followed_at: null,
    is_live: true,
    stream_id: null,
    category_id: "c1",
    category_name: "Cat",
    title: null,
    viewer_count: 1,
    started_at: null,
    category_started_at: null,
    ...overrides,
  }
}

function globalPref(
  categoryId: string,
  excluded: string[] = [],
): GlobalPreference {
  return {
    id: `g-${categoryId}`,
    category_id: categoryId,
    category_name: categoryId,
    box_art_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    exclusions: excluded.map((id) => ({
      id: `x-${id}`,
      broadcaster_user_id: id,
      created_at: "2026-01-01T00:00:00.000Z",
    })),
  }
}

function channelPref(
  broadcasterUserId: string,
  categoryId: string,
): ChannelPreference {
  return {
    id: `p-${broadcasterUserId}-${categoryId}`,
    broadcaster_user_id: broadcasterUserId,
    category_id: categoryId,
    category_name: categoryId,
    box_art_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
  }
}

function prefs(
  global: GlobalPreference[] = [],
  channelPrefs: ChannelPreference[] = [],
): PreferencesResponse {
  return { global, channel: channelPrefs }
}

function mute(broadcasterUserId: string): BroadcasterMute {
  return { broadcaster_user_id: broadcasterUserId } as BroadcasterMute
}

describe("createAlertMatcher", () => {
  describe("match", () => {
    it("should return null for an offline channel or one without a category", () => {
      const matcher = createAlertMatcher(prefs([globalPref("c1")]), [])

      expect(matcher.match(channel({ is_live: false }))).toBeNull()
      expect(matcher.match(channel({ category_id: null }))).toBeNull()
    })

    it("should return null before preferences have loaded", () => {
      expect(
        createAlertMatcher(undefined, undefined).match(channel()),
      ).toBeNull()
    })

    it("should return global when only a global preference covers the category", () => {
      const matcher = createAlertMatcher(prefs([globalPref("c1")]), [])

      expect(matcher.match(channel())).toBe("global")
    })

    it("should return channel when only a channel preference matches", () => {
      const matcher = createAlertMatcher(
        prefs([], [channelPref("b1", "c1"), channelPref("b2", "c1")]),
        [],
      )

      expect(matcher.match(channel())).toBe("channel")
      expect(matcher.match(channel({ broadcaster_user_id: "b3" }))).toBeNull()
    })

    it("should keep global precedence when both a global and a channel preference match", () => {
      const matcher = createAlertMatcher(
        prefs([globalPref("c1")], [channelPref("b1", "c1")]),
        [],
      )

      expect(matcher.match(channel())).toBe("global")
    })

    it("should return null when the global preference excludes the broadcaster", () => {
      const matcher = createAlertMatcher(prefs([globalPref("c1", ["b1"])]), [])

      expect(matcher.match(channel())).toBeNull()
      expect(matcher.match(channel({ broadcaster_user_id: "b2" }))).toBe(
        "global",
      )
    })

    it("should fall back to the channel preference when the global one excludes the broadcaster", () => {
      const matcher = createAlertMatcher(
        prefs([globalPref("c1", ["b1"])], [channelPref("b1", "c1")]),
        [],
      )

      expect(matcher.match(channel())).toBe("channel")
    })

    it("should return muted when a muted broadcaster has a source", () => {
      const global = createAlertMatcher(prefs([globalPref("c1")]), [mute("b1")])
      const specific = createAlertMatcher(
        prefs([], [channelPref("b1", "c1")]),
        [mute("b1")],
      )

      expect(global.match(channel())).toBe("muted")
      expect(specific.match(channel())).toBe("muted")
    })

    it("should return null for a muted broadcaster without a source", () => {
      const matcher = createAlertMatcher(prefs(), [mute("b1")])

      expect(matcher.match(channel())).toBeNull()
    })
  })

  describe("coversGlobally", () => {
    it("should be true only for a covered category the broadcaster isn't excluded from", () => {
      const matcher = createAlertMatcher(prefs([globalPref("c1", ["b1"])]), [])

      expect(matcher.coversGlobally("b2", "c1")).toBe(true)
      expect(matcher.coversGlobally("b1", "c1")).toBe(false)
      expect(matcher.coversGlobally("b2", "other")).toBe(false)
    })
  })

  describe("isMuted", () => {
    it("should reflect the muted broadcasters", () => {
      const matcher = createAlertMatcher(prefs(), [mute("b1")])

      expect(matcher.isMuted("b1")).toBe(true)
      expect(matcher.isMuted("b2")).toBe(false)
    })
  })
})
