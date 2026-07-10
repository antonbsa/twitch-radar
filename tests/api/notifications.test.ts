import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { E2E_USER_ID } from "../shared/seam-client"
import { orchestrator } from "./setup/orchestrator"
import { sendEventsubWebhook } from "./setup/eventsub-webhook"

const BROADCASTER_ID = "200"
const MINECRAFT = { id: "27471", name: "Minecraft" }
const CHATTING = { id: "509658", name: "Just Chatting" }

const STREAM = {
  id: "stream_n1",
  user_id: BROADCASTER_ID,
  user_login: "channeln",
  user_name: "ChannelN",
  game_id: MINECRAFT.id,
  game_name: MINECRAFT.name,
  viewer_count: 42,
  started_at: "2024-06-01T12:00:00Z",
  title: "Mining away",
}

function streamOnlineEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: STREAM.id,
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: STREAM.user_login,
    broadcaster_user_name: STREAM.user_name,
    type: "live",
    started_at: STREAM.started_at,
    ...overrides,
  }
}

function channelUpdateEvent(overrides: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: STREAM.user_login,
    broadcaster_user_name: STREAM.user_name,
    title: STREAM.title,
    language: "en",
    category_id: MINECRAFT.id,
    category_name: MINECRAFT.name,
    content_classification_labels: [],
    ...overrides,
  }
}

/** Mocks for the stream.online consumer path (app token + Get Streams). */
async function mockStreamOnlineLookups() {
  await orchestrator.mockTwitch.onAppToken()
  await orchestrator.mockTwitch.onStreams([STREAM])
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("notification matching and delivery", () => {
  it("should send a push for a per-channel preference match on stream.online", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d1") }],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/d1")

    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.notificationDeliveries.some((d) => d.status === "sent"),
      { userId: E2E_USER_ID },
    )
    expect(state.notificationDeliveries).toHaveLength(1)
    expect(state.notificationDeliveries[0]).toMatchObject({
      user_id: E2E_USER_ID,
      broadcaster_user_id: BROADCASTER_ID,
      category_id: MINECRAFT.id,
      trigger_type: "stream_started_in_category",
      stream_id: STREAM.id,
      status: "sent",
    })
    expect(state.notificationDeliveries[0].push_subscription_id).toBe(
      state.pushSubscriptions[0].id,
    )
    expect(state.notificationDeliveries[0].eventsub_message_id).not.toBeNull()
    expect(state.notificationDeliveries[0].sent_at).not.toBeNull()
  })

  it("should send one delivery when per-channel and global preferences both match", async () => {
    await orchestrator.seed({
      user: {},
      followedChannels: [
        {
          broadcasterUserId: BROADCASTER_ID,
          broadcasterLogin: STREAM.user_login,
          broadcasterDisplayName: STREAM.user_name,
        },
      ],
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d2") }],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/d2")

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
  })

  it("should match a global preference only for users following the broadcaster", async () => {
    // The e2e user follows and matches — its delivery is the fence proving
    // matching ran; the non-follower with the same global preference must
    // not get one (ADR 0007).
    await orchestrator.seed({
      user: {},
      followedChannels: [
        {
          broadcasterUserId: BROADCASTER_ID,
          broadcasterLogin: STREAM.user_login,
          broadcasterDisplayName: STREAM.user_name,
        },
      ],
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d3") }],
    })
    await orchestrator.seed({
      user: { id: "usr_nonfollower", twitchUserId: "twitch_nonfollower" },
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/d3")

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
    expect(state.notificationDeliveries[0].user_id).toBe(E2E_USER_ID)
  })

  it("should notify when a live channel switches into a desired category", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: CHATTING.id,
            categoryName: CHATTING.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d4") }],
    })
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: MINECRAFT.id,
        categoryName: MINECRAFT.name,
      },
    ])
    await orchestrator.mockTwitch.onPush("/push/d4")

    await sendEventsubWebhook("channel.update", {
      event: channelUpdateEvent({
        category_id: CHATTING.id,
        category_name: CHATTING.name,
      }),
      subscription: { version: "2" },
    })

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
    expect(state.notificationDeliveries[0]).toMatchObject({
      trigger_type: "switched_into_category",
      category_id: CHATTING.id,
      stream_id: STREAM.id,
      status: "sent",
    })
  })

  it("should not notify when a live channel switches out of the desired category", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d5") }],
    })
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: MINECRAFT.id,
        categoryName: MINECRAFT.name,
      },
    ])

    await sendEventsubWebhook("channel.update", {
      event: channelUpdateEvent({
        category_id: CHATTING.id,
        category_name: CHATTING.name,
      }),
      subscription: { version: "2" },
    })

    // The change row proves the consumer ran; matching for it happens in the
    // same handler invocation, so a short settle covers the write.
    await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.channelStateChanges.some((c) => c.change_type === "category_changed"),
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.notificationDeliveries).toHaveLength(0)
  })

  it("should not send duplicate notifications for repeated webhooks", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d6") }],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/d6")

    const messageId = "notif-dup-1"
    const timestamp = new Date().toISOString()
    await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      messageId,
      timestamp,
    })
    await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )

    // Exact retry (same message id) and a distinct re-announcement of the
    // same stream — neither may produce a second delivery.
    await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      messageId,
      timestamp,
    })
    await orchestrator.mockTwitch.onStreams([STREAM])
    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    // A later transition acts as the fence: once stream_ended is visible,
    // any duplicate delivery would be too.
    await sendEventsubWebhook("stream.offline", {
      event: {
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
      },
    })
    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.channelStateChanges.some((c) => c.change_type === "stream_ended"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
  })

  it("should mark the delivery failed and revoke the subscription on 410", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/gone") },
      ],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/gone", 410)

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.notificationDeliveries.some((d) => d.status === "failed"),
      { userId: E2E_USER_ID },
    )
    expect(state.notificationDeliveries[0].error_message).toContain("410")
    expect(state.pushSubscriptions[0].revoked_at).not.toBeNull()
  })

  it("should send to the surviving device and revoke the dead one", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/dead") },
        { endpoint: orchestrator.pushEndpoint("/push/live") },
      ],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()
    await orchestrator.mockTwitch.onPush("/push/dead", 410)
    await orchestrator.mockTwitch.onPush("/push/live", 201)

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.notificationDeliveries.some((d) => d.status === "sent"),
      { userId: E2E_USER_ID },
    )
    const byEndpoint = new Map(
      state.pushSubscriptions.map((s) => [new URL(s.endpoint).pathname, s]),
    )
    expect(byEndpoint.get("/push/dead")?.revoked_at).not.toBeNull()
    expect(byEndpoint.get("/push/live")?.revoked_at).toBeNull()
    expect(state.notificationDeliveries[0].push_subscription_id).toBe(
      byEndpoint.get("/push/live")?.id,
    )
  })

  it("should skip the delivery when the user has no active subscriptions", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/revoked"), revoked: true },
      ],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "skipped"),
    )
    expect(state.notificationDeliveries[0].error_message).toBe(
      "no_active_push_subscriptions",
    )
  })

  it("should not create deliveries for a non-matching category", async () => {
    await orchestrator.seed({
      user: {},
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: CHATTING.id,
            categoryName: CHATTING.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/d7") }],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await mockStreamOnlineLookups()

    await sendEventsubWebhook("stream.online", { event: streamOnlineEvent() })

    await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.channelStateChanges.some((c) => c.change_type === "stream_started"),
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.notificationDeliveries).toHaveLength(0)
  })
})
