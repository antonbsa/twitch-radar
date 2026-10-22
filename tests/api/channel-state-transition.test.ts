import { describe, expect, it } from "vitest"
import type { ChannelStateRecord } from "../../apps/api/src/db/repositories/channel-state"
import type { TwitchEventQueueMessage } from "../../apps/api/src/features/eventsub/types"
import {
  describeChange,
  isStaleEvent,
  transition,
  type StreamReading,
} from "../../apps/api/src/features/channel-state/transition"

// The pure rules behind Channel State (ADRs 0033, 0051, issue #120), asserted
// without a worker or a Twitch mock.

const ID = "100"
const NOW = "2024-06-01T15:00:00.000Z"
const EVENT_AT = "2024-06-01T14:00:00.000Z"

const offline: ChannelStateRecord = {
  broadcaster_user_id: ID,
  is_live: false,
  stream_id: null,
  category_id: null,
  category_name: null,
  title: null,
  thumbnail_url: null,
  viewer_count: null,
  started_at: null,
  category_started_at: null,
  stream_type: null,
  last_live_at: null,
  last_category_id: null,
  last_category_name: null,
  updated_from_event_at: null,
  updated_at: "2024-06-01T10:00:00.000Z",
}

const live: ChannelStateRecord = {
  ...offline,
  is_live: true,
  stream_id: "s1",
  category_id: "27471",
  category_name: "Minecraft",
  title: "Playing",
  thumbnail_url: "https://thumb/live.jpg",
  viewer_count: 10,
  started_at: "2024-06-01T11:00:00Z",
  category_started_at: "2024-06-01T12:00:00Z",
  stream_type: "live",
  updated_from_event_at: "2024-06-01T13:00:00Z",
}

const stream: StreamReading = {
  id: "s1",
  user_id: ID,
  game_id: "27471",
  game_name: "Minecraft",
  title: "Playing",
  viewer_count: 42,
  started_at: "2024-06-01T11:00:00Z",
  thumbnail_url: "https://thumb/{width}x{height}.jpg",
  type: "live",
}

const broadcaster = {
  broadcaster_user_id: ID,
  broadcaster_user_login: "a",
  broadcaster_user_name: "A",
}
const envelope = {
  messageId: "m1",
  messageTimestamp: EVENT_AT,
  receivedAt: NOW,
}
const online = (type = "live"): TwitchEventQueueMessage => ({
  ...envelope,
  eventType: "stream.online",
  event: { ...broadcaster, id: "s2", type, started_at: "2024-06-01T13:59:00Z" },
})
const offlineEvent: TwitchEventQueueMessage = {
  ...envelope,
  eventType: "stream.offline",
  event: broadcaster,
}
const update = (
  categoryId: string,
  title = "Playing",
): TwitchEventQueueMessage => ({
  ...envelope,
  eventType: "channel.update",
  event: {
    ...broadcaster,
    title,
    language: "en",
    category_id: categoryId,
    category_name: categoryId ? "Cat" : "",
    content_classification_labels: [],
  },
})
const snapshot = (s: StreamReading | null) =>
  ({ kind: "snapshot", broadcasterId: ID, stream: s }) as const

describe("transition: Snapshot", () => {
  it("should keep category_started_at for the same stream and category", () => {
    const next = transition(live, snapshot(stream), NOW)
    expect(next.category_started_at).toBe(live.category_started_at)
    expect(next.viewer_count).toBe(42)
    expect(next.thumbnail_url).toBe("https://thumb/640x360.jpg")
  })

  it("should null category_started_at for a new stream, a new category or no row", () => {
    expect(
      transition(live, snapshot({ ...stream, id: "s2" }), NOW)
        .category_started_at,
    ).toBeNull()
    expect(
      transition(live, snapshot({ ...stream, game_id: "1" }), NOW)
        .category_started_at,
    ).toBeNull()
    expect(
      transition(null, snapshot(stream), NOW).category_started_at,
    ).toBeNull()
  })

  it("should store a live stream without a category as null", () => {
    const next = transition(
      live,
      snapshot({ ...stream, game_id: "", game_name: "" }),
      NOW,
    )
    expect(next.category_id).toBeNull()
    expect(next.category_name).toBeNull()
  })

  it("should never erase stream_type or updated_from_event_at", () => {
    for (const s of [stream, null]) {
      const next = transition(live, snapshot(s), NOW)
      expect(next.stream_type).toBe("live")
      expect(next.updated_from_event_at).toBe(live.updated_from_event_at)
    }
  })

  it("should capture last_* when a live channel is absent", () => {
    const next = transition(live, snapshot(null), NOW)
    expect(next).toMatchObject({
      is_live: false,
      stream_id: null,
      viewer_count: null,
      started_at: null,
      category_started_at: null,
      last_live_at: NOW,
      last_category_id: "27471",
      last_category_name: "Minecraft",
    })
  })

  it("should copy category, title and thumbnail for an offline channel", () => {
    const stored = {
      ...offline,
      category_id: "1",
      category_name: "Chatting",
      title: "t",
      thumbnail_url: "u",
      last_live_at: "2024-05-01T00:00:00Z",
    }
    const next = transition(stored, snapshot(null), NOW)
    expect(next).toMatchObject({
      category_id: "1",
      category_name: "Chatting",
      title: "t",
      thumbnail_url: "u",
      last_live_at: "2024-05-01T00:00:00Z",
    })
  })
})

describe("transition: Event", () => {
  it("should start category_started_at at the stream start on stream.online and keep stream_type from the stream", () => {
    const next = transition(
      offline,
      {
        kind: "event",
        message: online("live"),
        stream: { ...stream, type: "rerun" },
      },
      NOW,
    )
    expect(next).toMatchObject({
      is_live: true,
      stream_id: "s1",
      category_started_at: stream.started_at,
      stream_type: "rerun",
      updated_from_event_at: EVENT_AT,
    })
  })

  it("should fall back to the stored category and the payload when no stream was found", () => {
    const stored = {
      ...offline,
      category_id: "9",
      category_name: "Stored",
      title: "T",
    }
    const next = transition(
      stored,
      { kind: "event", message: online("rerun") },
      NOW,
    )
    expect(next).toMatchObject({
      stream_id: "s2",
      category_id: "9",
      category_name: "Stored",
      title: "T",
      started_at: "2024-06-01T13:59:00Z",
      category_started_at: "2024-06-01T13:59:00Z",
      stream_type: "rerun",
    })
  })

  it("should capture last_* at the event time on stream.offline and clear category_started_at", () => {
    const next = transition(live, { kind: "event", message: offlineEvent }, NOW)
    expect(next).toMatchObject({
      is_live: false,
      category_started_at: null,
      last_live_at: EVENT_AT,
      last_category_id: "27471",
      stream_type: "live",
      category_id: "27471",
    })
  })

  it("should keep last_* on a repeated stream.offline", () => {
    const stored = { ...offline, last_live_at: "2024-05-01T00:00:00Z" }
    const next = transition(
      stored,
      { kind: "event", message: offlineEvent },
      NOW,
    )
    expect(next.last_live_at).toBe("2024-05-01T00:00:00Z")
  })

  it("should take the event time on a live category change and keep it on a title-only update", () => {
    expect(
      transition(live, { kind: "event", message: update("509658") }, NOW)
        .category_started_at,
    ).toBe(EVENT_AT)
    expect(
      transition(live, { kind: "event", message: update("27471", "New") }, NOW),
    ).toMatchObject({
      category_started_at: live.category_started_at,
      title: "New",
      stream_type: "live",
      stream_id: "s1",
    })
  })

  it("should null category_started_at on a channel.update while offline", () => {
    const stored = { ...offline, category_started_at: "2024-06-01T12:00:00Z" }
    const next = transition(
      stored,
      { kind: "event", message: update("509658") },
      NOW,
    )
    expect(next.category_started_at).toBeNull()
    expect(next.category_id).toBe("509658")
  })

  it("should store an empty category as null", () => {
    expect(
      transition(live, { kind: "event", message: update("") }, NOW).category_id,
    ).toBeNull()
  })
})

describe("isStaleEvent", () => {
  it("should be stale only when a later Event was applied", () => {
    expect(isStaleEvent(null, EVENT_AT)).toBe(false)
    expect(isStaleEvent(offline, EVENT_AT)).toBe(false)
    expect(
      isStaleEvent({ ...live, updated_from_event_at: EVENT_AT }, EVENT_AT),
    ).toBe(false)
    expect(
      isStaleEvent({ ...live, updated_from_event_at: NOW }, EVENT_AT),
    ).toBe(true)
  })
})

describe("describeChange", () => {
  const changeFor = (
    previous: ChannelStateRecord | null,
    message: TwitchEventQueueMessage,
  ) =>
    describeChange(
      previous,
      transition(previous, { kind: "event", message }, NOW),
      message,
      NOW,
    )

  it("should record stream_started for a new stream but not for the one already known live", () => {
    expect(changeFor(offline, online())?.changeType).toBe("stream_started")
    expect(changeFor(null, online())?.previousIsLive).toBeNull()
    expect(
      changeFor(live, {
        ...online(),
        event: { ...online().event, id: "s1" },
      } as TwitchEventQueueMessage),
    ).toBeNull()
  })

  it("should record stream_ended only from live", () => {
    expect(changeFor(live, offlineEvent)?.changeType).toBe("stream_ended")
    expect(changeFor(offline, offlineEvent)).toBeNull()
  })

  it("should record category_changed only for a live category change", () => {
    expect(changeFor(live, update("509658"))?.changeType).toBe(
      "category_changed",
    )
    expect(changeFor(live, update("27471"))).toBeNull()
    expect(changeFor(offline, update("509658"))).toBeNull()
  })
})
