import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { E2E_USER_ID } from "../shared/seam-client"
import { orchestrator } from "./setup/orchestrator"
import { sendEventsubWebhook } from "./setup/eventsub-webhook"

const BROADCASTER_ID = "200"
const OTHER_BROADCASTER_ID = "300"
const MINECRAFT = { id: "27471", name: "Minecraft" }

const STREAM = {
  id: "stream_s1",
  user_id: BROADCASTER_ID,
  user_login: "channels",
  user_name: "ChannelS",
  game_id: MINECRAFT.id,
  game_name: MINECRAFT.name,
  viewer_count: 42,
  started_at: "2024-06-01T12:00:00Z",
  title: "Mining away",
}

const FOLLOWED = [
  {
    broadcasterUserId: BROADCASTER_ID,
    broadcasterLogin: STREAM.user_login,
    broadcasterDisplayName: STREAM.user_name,
  },
]

const CHANNEL_PREFERENCE = {
  channel: [
    {
      broadcasterUserId: BROADCASTER_ID,
      categoryId: MINECRAFT.id,
      categoryName: MINECRAFT.name,
    },
  ],
}

const SUPPRESSED_USER = {
  id: "usr_suppressed",
  twitchUserId: "twitch_suppressed",
}

function api(path: string, cookie: string, method = "GET", body?: unknown) {
  return fetch(`${orchestrator.baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** Both users hold the same channel preference, so only suppression can tell them apart. */
async function seedFenceAndSuppressedUser(
  suppressed: Parameters<typeof orchestrator.seed>[0],
) {
  await orchestrator.seed({
    user: {},
    preferences: CHANNEL_PREFERENCE,
    pushSubscriptions: [
      { endpoint: orchestrator.pushEndpoint("/push/suppress-fence") },
    ],
  })
  await orchestrator.seed({
    preferences: CHANNEL_PREFERENCE,
    ...suppressed,
  })
  await orchestrator.seedChannelState([
    { broadcasterUserId: BROADCASTER_ID, isLive: false },
  ])
  await orchestrator.mockTwitch.onAppToken()
  await orchestrator.mockTwitch.onStreams([STREAM])
  await orchestrator.mockTwitch.onPush("/push/suppress-fence")
}

async function expectOnlyFenceUserNotified() {
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
  const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
    s.notificationDeliveries.some((d) => d.status === "sent"),
  )
  expect(state.notificationDeliveries).toHaveLength(1)
  expect(state.notificationDeliveries[0].user_id).toBe(E2E_USER_ID)
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("PATCH /api/me/notifications-paused", () => {
  it("should pause and resume, exposing the state on GET /me", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const paused = await api("/me/notifications-paused", cookie, "PATCH", {
      paused: true,
    })
    expect(paused.status).toBe(200)
    const me = (await (await api("/me", cookie)).json()) as {
      data: { notifications_paused_at: string | null }
    }
    expect(me.data.notifications_paused_at).toEqual(expect.any(String))

    await api("/me/notifications-paused", cookie, "PATCH", { paused: false })
    const resumed = (await (await api("/me", cookie)).json()) as {
      data: { notifications_paused_at: string | null }
    }
    expect(resumed.data.notifications_paused_at).toBeNull()
  })

  it("should reject a payload without a boolean paused", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const res = await api("/me/notifications-paused", cookie, "PATCH", {})
    expect(res.status).toBe(400)
  })
})

describe("broadcaster mutes API", () => {
  it("should create, return the existing row, soft-disable and revive", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const body = { broadcaster_user_id: BROADCASTER_ID }

    const created = await api("/notifications/mutes", cookie, "POST", body)
    expect(created.status).toBe(201)
    const { data } = (await created.json()) as { data: { id: string } }

    const again = await api("/notifications/mutes", cookie, "POST", body)
    expect(again.status).toBe(200)
    expect(((await again.json()) as { data: { id: string } }).data.id).toBe(
      data.id,
    )

    const del = await api(`/notifications/mutes/${data.id}`, cookie, "DELETE")
    expect(del.status).toBe(204)
    const empty = (await (
      await api("/notifications/mutes", cookie)
    ).json()) as {
      data: unknown[]
    }
    expect(empty.data).toHaveLength(0)

    const revived = await api("/notifications/mutes", cookie, "POST", body)
    expect(revived.status).toBe(200)
    const list = (await (await api("/notifications/mutes", cookie)).json()) as {
      data: { id: string; broadcaster_user_id: string }[]
    }
    expect(list.data).toEqual([
      expect.objectContaining({
        id: data.id,
        broadcaster_user_id: BROADCASTER_ID,
      }),
    ])
  })

  it("should not let a user delete another user's mute", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const other = await orchestrator.createAuthenticatedSession({
      id: "usr_other_mute",
      twitchUserId: "twitch_other_mute",
    })
    const created = await api("/notifications/mutes", other.cookie, "POST", {
      broadcaster_user_id: BROADCASTER_ID,
    })
    const { data } = (await created.json()) as { data: { id: string } }

    const res = await api(`/notifications/mutes/${data.id}`, cookie, "DELETE")
    expect(res.status).toBe(404)
  })
})

describe("pause and mute at match time", () => {
  it("should not notify a paused user", async () => {
    await seedFenceAndSuppressedUser({
      user: {
        ...SUPPRESSED_USER,
        notificationsPausedAt: new Date().toISOString(),
      },
    })
    await expectOnlyFenceUserNotified()
  })

  it("should not notify a user muting the broadcaster, but notify others", async () => {
    await seedFenceAndSuppressedUser({
      user: SUPPRESSED_USER,
      broadcasterMutes: [{ broadcasterUserId: BROADCASTER_ID }],
    })
    await expectOnlyFenceUserNotified()
  })

  it("should keep notifying a user who muted a different broadcaster", async () => {
    await orchestrator.seed({
      user: {},
      preferences: CHANNEL_PREFERENCE,
      broadcasterMutes: [{ broadcasterUserId: OTHER_BROADCASTER_ID }],
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/suppress-other") },
      ],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])
    await orchestrator.mockTwitch.onPush("/push/suppress-other")
    await expectOnlyFenceUserNotified()
  })

  it("should suppress global preference matches for paused users", async () => {
    await orchestrator.seed({
      user: {},
      followedChannels: FOLLOWED,
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/suppress-fence") },
      ],
    })
    await orchestrator.seed({
      user: {
        ...SUPPRESSED_USER,
        notificationsPausedAt: new Date().toISOString(),
      },
      followedChannels: FOLLOWED,
      preferences: {
        global: [{ categoryId: MINECRAFT.id, categoryName: MINECRAFT.name }],
      },
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])
    await orchestrator.mockTwitch.onPush("/push/suppress-fence")
    await expectOnlyFenceUserNotified()
  })
})

describe("pause and mute in the snooze sweep", () => {
  const dueSnooze = () => ({
    broadcasterUserId: BROADCASTER_ID,
    categoryId: MINECRAFT.id,
    fireAt: new Date(Date.now() - 1000).toISOString(),
  })
  const liveState = {
    broadcasterUserId: BROADCASTER_ID,
    isLive: true,
    streamId: STREAM.id,
    categoryId: MINECRAFT.id,
    categoryName: MINECRAFT.name,
  }

  it("should expire the snooze of a paused user without sending", async () => {
    await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      user: { notificationsPausedAt: new Date().toISOString() },
    })
    await orchestrator.seedNotificationSnoozes([dueSnooze()])
    await orchestrator.seedChannelState([liveState])

    await orchestrator.runScheduled()

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationSnoozes.some((snz) => snz.status === "expired"),
    )
    expect(state.notificationDeliveries).toHaveLength(0)
  })

  it("should expire the snooze when the broadcaster is muted", async () => {
    await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      broadcasterMutes: [{ broadcasterUserId: BROADCASTER_ID }],
    })
    await orchestrator.seedNotificationSnoozes([dueSnooze()])
    await orchestrator.seedChannelState([liveState])

    await orchestrator.runScheduled()

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationSnoozes.some((snz) => snz.status === "expired"),
    )
    expect(state.notificationDeliveries).toHaveLength(0)
  })
})
