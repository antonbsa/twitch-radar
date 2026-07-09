import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"
import { sendEventsubWebhook } from "./setup/eventsub-webhook"

const BROADCASTER_ID = "100"

const STREAM = {
  id: "stream_1",
  user_id: BROADCASTER_ID,
  user_login: "channela",
  user_name: "ChannelA",
  game_id: "27471",
  game_name: "Minecraft",
  viewer_count: 500,
  started_at: "2024-06-01T12:00:00Z",
  title: "Building stuff",
}

function streamOnlineEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: STREAM.id,
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: "channela",
    broadcaster_user_name: "ChannelA",
    type: "live",
    started_at: STREAM.started_at,
    ...overrides,
  }
}

function channelUpdateEvent(overrides: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: "channela",
    broadcaster_user_name: "ChannelA",
    title: "Building stuff",
    language: "en",
    category_id: "27471",
    category_name: "Minecraft",
    content_classification_labels: [],
    ...overrides,
  }
}

function streamOfflineEvent() {
  return {
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: "channela",
    broadcaster_user_name: "ChannelA",
  }
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("POST /api/webhooks/twitch/eventsub verification", () => {
  it("should answer the callback challenge and mark the subscription enabled", async () => {
    await orchestrator.seedEventsubSubscriptions([
      {
        broadcasterUserId: BROADCASTER_ID,
        eventType: "stream.online",
        status: "webhook_callback_verification_pending",
        twitchSubscriptionId: "twitch_sub_abc",
      },
    ])

    const res = await sendEventsubWebhook("stream.online", {
      messageType: "webhook_callback_verification",
      challenge: "expected-challenge-token",
      subscription: { id: "twitch_sub_abc" },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    await expect(res.text()).resolves.toBe("expected-challenge-token")

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions[0]).toMatchObject({
      twitch_subscription_id: "twitch_sub_abc",
      status: "enabled",
    })
  })

  it("should reject an invalid signature", async () => {
    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      signatureOverride: `sha256=${"0".repeat(64)}`,
    })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_signature" },
    })
  })

  it("should reject a signature computed with the wrong secret", async () => {
    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      secret: "not-the-webhook-secret",
    })
    expect(res.status).toBe(403)
  })

  it("should reject a replayed message with an old timestamp", async () => {
    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    })
    expect(res.status).toBe(403)
  })

  it("should reject a request without EventSub headers", async () => {
    const res = await fetch(
      `${orchestrator.baseUrl}/api/webhooks/twitch/eventsub`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: {}, event: {} }),
      },
    )
    expect(res.status).toBe(403)
  })

  it("should record a revocation against the local subscription", async () => {
    await orchestrator.seedEventsubSubscriptions([
      {
        broadcasterUserId: BROADCASTER_ID,
        eventType: "stream.online",
        status: "enabled",
        twitchSubscriptionId: "twitch_sub_abc",
      },
    ])

    const res = await sendEventsubWebhook("stream.online", {
      messageType: "revocation",
      subscription: { id: "twitch_sub_abc", status: "authorization_revoked" },
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions[0].status).toBe("authorization_revoked")
    expect(state.eventsubSubscriptions[0].revoked_at).not.toBeNull()
  })

  it("should acknowledge an unmonitored subscription type without processing", async () => {
    const res = await sendEventsubWebhook("channel.follow", {
      event: { broadcaster_user_id: BROADCASTER_ID },
    })
    expect(res.status).toBe(204)
  })
})

describe("EventSub queue processing", () => {
  it("should process stream.online: fetch stream data, mark live, record stream_started", async () => {
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])

    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelStateChanges.length > 0,
    )
    expect(state.channelState[0]).toMatchObject({
      is_live: true,
      stream_id: "stream_1",
      category_id: "27471",
      category_name: "Minecraft",
      title: "Building stuff",
      viewer_count: 500,
    })
    expect(state.channelStateChanges).toHaveLength(1)
    expect(state.channelStateChanges[0]).toMatchObject({
      change_type: "stream_started",
      previous_is_live: false,
      next_is_live: true,
      previous_category_id: null,
      next_category_id: "27471",
      next_category_name: "Minecraft",
      stream_id: "stream_1",
    })
  })

  it("should not record stream_started when the stream is already known as live", async () => {
    // The state a preference creation seeds for an already-live channel
    // (ADR 0008: no catch-up transitions for streams we already know about).
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: STREAM.game_id,
        categoryName: STREAM.game_name,
      },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])

    const res = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
    })
    expect(res.status).toBe(204)

    // updated_from_event_at flipping from null proves the consumer ran.
    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.updated_from_event_at !== null,
    )
    expect(state.channelState[0].is_live).toBe(true)
    expect(state.channelStateChanges).toHaveLength(0)
  })

  it("should not create duplicate state changes for a duplicate message id", async () => {
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])

    const messageId = "dup-message-id-1"
    const timestamp = new Date().toISOString()
    const first = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      messageId,
      timestamp,
    })
    expect(first.status).toBe(204)
    const second = await sendEventsubWebhook("stream.online", {
      event: streamOnlineEvent(),
      messageId,
      timestamp,
    })
    expect(second.status).toBe(204)

    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelStateChanges.length > 0,
    )
    // A later event acts as a fence: once it has been processed, any
    // duplicate stream_started would already be visible.
    const offline = await sendEventsubWebhook("stream.offline", {
      event: streamOfflineEvent(),
    })
    expect(offline.status).toBe(204)
    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.channelStateChanges.some((c) => c.change_type === "stream_ended"),
    )

    const started = state.channelStateChanges.filter(
      (c) => c.change_type === "stream_started",
    )
    expect(started).toHaveLength(1)
  })

  it("should record category_changed for a live category switch", async () => {
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: "27471",
        categoryName: "Minecraft",
      },
    ])

    const res = await sendEventsubWebhook("channel.update", {
      event: channelUpdateEvent({
        category_id: "509658",
        category_name: "Just Chatting",
      }),
      subscription: { version: "2" },
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelStateChanges.length > 0,
    )
    expect(state.channelStateChanges[0]).toMatchObject({
      change_type: "category_changed",
      previous_is_live: true,
      next_is_live: true,
      previous_category_id: "27471",
      previous_category_name: "Minecraft",
      next_category_id: "509658",
      next_category_name: "Just Chatting",
      stream_id: "stream_1",
    })
    expect(state.channelState[0]).toMatchObject({
      is_live: true,
      category_id: "509658",
      category_name: "Just Chatting",
    })
  })

  it("should not record a change for a live title-only update", async () => {
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: "27471",
        categoryName: "Minecraft",
        title: "Old title",
      },
    ])

    const res = await sendEventsubWebhook("channel.update", {
      event: channelUpdateEvent({ title: "New title" }),
      subscription: { version: "2" },
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.title === "New title",
    )
    expect(state.channelStateChanges).toHaveLength(0)
  })

  it("should update state but record no change for an offline category switch", async () => {
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])

    const res = await sendEventsubWebhook("channel.update", {
      event: channelUpdateEvent({
        category_id: "509658",
        category_name: "Just Chatting",
      }),
      subscription: { version: "2" },
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.category_id === "509658",
    )
    expect(state.channelState[0].is_live).toBe(false)
    expect(state.channelStateChanges).toHaveLength(0)
  })

  it("should process stream.offline: mark offline and record stream_ended", async () => {
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: "27471",
        categoryName: "Minecraft",
        viewerCount: 500,
        startedAt: STREAM.started_at,
      },
    ])

    const res = await sendEventsubWebhook("stream.offline", {
      event: streamOfflineEvent(),
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelStateChanges.length > 0,
    )
    expect(state.channelStateChanges[0]).toMatchObject({
      change_type: "stream_ended",
      previous_is_live: true,
      next_is_live: false,
      previous_category_id: "27471",
      stream_id: "stream_1",
    })
    expect(state.channelState[0]).toMatchObject({
      is_live: false,
      stream_id: null,
      viewer_count: null,
      started_at: null,
      // Category is channel info, not stream info — it persists offline.
      category_id: "27471",
    })
  })

  it("should not record stream_ended when the channel is already offline", async () => {
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])

    const res = await sendEventsubWebhook("stream.offline", {
      event: streamOfflineEvent(),
    })
    expect(res.status).toBe(204)

    const state = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.updated_from_event_at !== null,
    )
    expect(state.channelStateChanges).toHaveLength(0)
  })
})

describe("EventSub subscription creation", () => {
  const PENDING_ROWS = [
    { broadcasterUserId: BROADCASTER_ID, eventType: "stream.online" },
    { broadcasterUserId: BROADCASTER_ID, eventType: "stream.offline" },
    {
      broadcasterUserId: BROADCASTER_ID,
      eventType: "channel.update",
      eventVersion: "2",
    },
  ]

  it("should create pending subscriptions on Twitch and persist their ids", async () => {
    await orchestrator.seedEventsubSubscriptions(PENDING_ROWS)
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionCreate("tsub_1")
    await orchestrator.mockTwitch.onEventsubSubscriptionCreate("tsub_2")
    await orchestrator.mockTwitch.onEventsubSubscriptionCreate("tsub_3")

    await orchestrator.runScheduled()

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions).toHaveLength(3)
    for (const sub of state.eventsubSubscriptions) {
      expect(sub.status).toBe("webhook_callback_verification_pending")
    }
    // Creation order isn't part of the contract — just require that each row
    // got its own Twitch subscription id.
    expect(
      state.eventsubSubscriptions.map((s) => s.twitch_subscription_id).sort(),
    ).toEqual(["tsub_1", "tsub_2", "tsub_3"])
  })

  it("should leave rows pending when Twitch rejects the create", async () => {
    await orchestrator.seedEventsubSubscriptions([PENDING_ROWS[0]])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionCreate(
      "unused",
      "error",
      500,
    )

    await orchestrator.runScheduled()

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions[0]).toMatchObject({
      status: "pending",
      twitch_subscription_id: null,
    })
  })
})
