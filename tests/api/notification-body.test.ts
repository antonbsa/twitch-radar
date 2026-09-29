import { describe, expect, it } from "vitest"
import { buildBody } from "../../apps/api/src/services/notifications/match"
import type { ChannelStateRecord } from "../../apps/api/src/db/repositories/channel-state"

// The push payload buildBody feeds into is encrypted end-to-end (ADR 0035),
// so this precedence logic can't be asserted through an HTTP round trip —
// see the comment on buildBody's export.

const NOW = new Date("2024-06-01T14:15:00Z")

function state(
  overrides: Partial<ChannelStateRecord> = {},
): ChannelStateRecord {
  return {
    broadcaster_user_id: "200",
    is_live: true,
    stream_id: "stream_1",
    category_id: "27471",
    category_name: "Minecraft",
    title: null,
    thumbnail_url: null,
    viewer_count: null,
    started_at: null,
    stream_type: "live",
    updated_from_event_at: null,
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

describe("buildBody — stream_started_in_category", () => {
  it("uses the stream title when it isn't redundant with the category", () => {
    const body = buildBody(
      "stream_started_in_category",
      "Minecraft",
      null,
      state({ title: "Building a castle today!" }),
      NOW,
    )
    expect(body).toEqual({
      bodyKey: "notification.stream_started_in_category.body.stream_title",
      params: { streamTitle: "Building a castle today!" },
    })
  })

  it("omits the body when the title just restates the category", () => {
    const body = buildBody(
      "stream_started_in_category",
      "Minecraft",
      null,
      state({ title: "Minecraft" }),
      NOW,
    )
    expect(body).toBeNull()
  })

  it("omits the body when there is no stream title", () => {
    const body = buildBody(
      "stream_started_in_category",
      "Minecraft",
      null,
      state({ title: null }),
      NOW,
    )
    expect(body).toBeNull()
  })
})

describe("buildBody — switched_into_category", () => {
  it("prefers uptime + previous category when both are available", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      "Minecraft",
      state({ started_at: "2024-06-01T12:00:00Z", title: "Ignored title" }),
      NOW,
    )
    expect(body).toEqual({
      bodyKey: "notification.switched_into_category.body.uptime_and_previous",
      params: { hours: "2", minutes: "15", previousCategory: "Minecraft" },
    })
  })

  it("degrades to uptime-only when there is no previous category", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      null,
      state({ started_at: "2024-06-01T12:00:00Z" }),
      NOW,
    )
    expect(body).toEqual({
      bodyKey: "notification.switched_into_category.body.uptime_only",
      params: { hours: "2", minutes: "15" },
    })
  })

  it("degrades to previous-category-only when uptime is unavailable", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      "Minecraft",
      state({ started_at: null }),
      NOW,
    )
    expect(body).toEqual({
      bodyKey: "notification.switched_into_category.body.previous_only",
      params: { previousCategory: "Minecraft" },
    })
  })

  it("degrades to the stream title when neither uptime nor previous category is available", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      null,
      state({ started_at: null, title: "Chatting about the update" }),
      NOW,
    )
    expect(body).toEqual({
      bodyKey: "notification.switched_into_category.body.stream_title",
      params: { streamTitle: "Chatting about the update" },
    })
  })

  it("is title-only when nothing else is available", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      null,
      state({ started_at: null, title: null }),
      NOW,
    )
    expect(body).toBeNull()
  })

  it("is title-only when the channel state row itself is missing", () => {
    const body = buildBody(
      "switched_into_category",
      "Just Chatting",
      null,
      null,
      NOW,
    )
    expect(body).toBeNull()
  })
})
