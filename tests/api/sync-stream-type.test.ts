import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { E2E_USER_ID } from "../shared/seam-client"
import { orchestrator } from "./setup/orchestrator"
import { sendEventsubWebhook } from "./setup/eventsub-webhook"

const BROADCASTER_ID = "200"
const MINECRAFT = { id: "27471", name: "Minecraft" }
const CHATTING = { id: "509658", name: "Just Chatting" }
const CHANNEL = {
  broadcaster_id: BROADCASTER_ID,
  broadcaster_login: "channeln",
  broadcaster_name: "ChannelN",
}
const STREAM = {
  id: "stream_rr1",
  user_id: BROADCASTER_ID,
  user_login: "channeln",
  user_name: "ChannelN",
  game_id: MINECRAFT.id,
  game_name: MINECRAFT.name,
  viewer_count: 42,
  started_at: "2024-06-01T12:00:00Z",
  title: "Rerun night",
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("follow sync while a rerun is live (ADR 0051, ADR 0033)", () => {
  it("should keep stream_type and suppress the category-change notification after a sync", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      id: E2E_USER_ID,
    })
    await orchestrator.seed({
      preferences: {
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: CHATTING.id,
            categoryName: CHATTING.name,
          },
        ],
      },
      pushSubscriptions: [{ endpoint: orchestrator.pushEndpoint("/push/rr") }],
    })

    // First sync only creates the follow row.
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    await orchestrator.waitForFollowedChannels(cookie, (i) => i.length === 1)
    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState.length === 1,
    )

    // The broadcaster goes live as a rerun, via EventSub.
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([{ ...STREAM, type: "rerun" }])
    await sendEventsubWebhook("stream.online", {
      event: {
        id: STREAM.id,
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
        type: "rerun",
        started_at: STREAM.started_at,
      },
    })
    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.stream_type === "rerun",
    )

    // A follow sync runs while Twitch reports the stream (new viewer count
    // marks the write that lands).
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([
      { ...STREAM, viewer_count: 999 },
    ])
    await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    const afterSync = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.viewer_count === 999,
    )
    expect(afterSync.channelState[0]).toMatchObject({
      stream_type: "rerun",
    })
    expect(afterSync.channelState[0]!.updated_from_event_at).not.toBeNull()

    // A category change then arrives; ADR 0051 says a rerun never notifies.
    await orchestrator.mockTwitch.onPush("/push/rr")
    await sendEventsubWebhook("channel.update", {
      event: {
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
        title: STREAM.title,
        language: "en",
        category_id: CHATTING.id,
        category_name: CHATTING.name,
        content_classification_labels: [],
      },
      subscription: { version: "2" },
    })
    await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.channelStateChanges.some((c) => c.change_type === "category_changed"),
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const state = await orchestrator.inspect([BROADCASTER_ID], E2E_USER_ID)
    expect(state.notificationDeliveries).toHaveLength(0)
  })
})

describe("follow sync of an offline channel (ADR 0033)", () => {
  it("should keep the category and title that channel.update recorded", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      id: E2E_USER_ID,
    })
    const sync = async () => {
      await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
        method: "POST",
        headers: { Cookie: cookie },
      })
    }

    // The follow exists and the broadcaster is offline.
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await sync()
    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState.length === 1,
    )

    await sendEventsubWebhook("channel.update", {
      event: {
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
        title: "Offline title",
        language: "en",
        category_id: CHATTING.id,
        category_name: CHATTING.name,
        content_classification_labels: [],
      },
      subscription: { version: "2" },
    })
    const afterUpdate = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.category_id === CHATTING.id,
    )
    expect(afterUpdate.channelState[0]).toMatchObject({
      is_live: false,
      category_name: CHATTING.name,
      title: "Offline title",
    })

    // Another sync, still no stream. updated_at moving marks the write landing.
    const before = afterUpdate.channelState[0]!.updated_at
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await sync()
    const afterSync = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.updated_at !== before,
    )
    expect(afterSync.channelState[0]).toMatchObject({
      is_live: false,
      category_id: CHATTING.id,
      category_name: CHATTING.name,
      title: "Offline title",
    })
  })

  it("should fall back to the channel.update info on stream.online when Get Streams is empty", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      id: E2E_USER_ID,
    })
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState.length === 1,
    )
    await sendEventsubWebhook("channel.update", {
      event: {
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
        title: "Offline title",
        language: "en",
        category_id: CHATTING.id,
        category_name: CHATTING.name,
        content_classification_labels: [],
      },
      subscription: { version: "2" },
    })
    const afterUpdate = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.category_id === CHATTING.id,
    )
    await orchestrator.mockTwitch.onFollowedChannels([CHANNEL])
    await orchestrator.mockTwitch.onFollowedStreams([])
    await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) =>
        s.channelState[0]?.updated_at !==
        afterUpdate.channelState[0]!.updated_at,
    )

    // Get Streams lags behind stream.online: the handler falls back to the
    // stored channel info.
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([])
    await sendEventsubWebhook("stream.online", {
      event: {
        id: STREAM.id,
        broadcaster_user_id: BROADCASTER_ID,
        broadcaster_user_login: STREAM.user_login,
        broadcaster_user_name: STREAM.user_name,
        type: "live",
        started_at: STREAM.started_at,
      },
    })
    const live = await orchestrator.waitForInspect(
      [BROADCASTER_ID],
      (s) => s.channelState[0]?.is_live === true,
    )
    expect(live.channelState[0]).toMatchObject({
      category_id: CHATTING.id,
      category_name: CHATTING.name,
      title: "Offline title",
    })
  })
})
