import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { E2E_USER_ID } from "../shared/seam-client"
import { orchestrator } from "./setup/orchestrator"
import { sendEventsubWebhook } from "./setup/eventsub-webhook"

const BROADCASTER_ID = "200"
const MINECRAFT = { id: "27471", name: "Minecraft" }

const STREAM = {
  id: "stream_x1",
  user_id: BROADCASTER_ID,
  user_login: "channelx",
  user_name: "ChannelX",
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

const GLOBAL = (excluded: string[] = []) => ({
  global: [
    {
      categoryId: MINECRAFT.id,
      categoryName: MINECRAFT.name,
      excludedBroadcasterUserIds: excluded,
    },
  ],
})

interface PreferencesBody {
  data: {
    global: {
      id: string
      exclusions: { id: string; broadcaster_user_id: string }[]
    }[]
  }
}

function api(path: string, cookie: string, method = "GET", body?: unknown) {
  return fetch(`${orchestrator.baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function getGlobalPreference(cookie: string) {
  const res = await api("/preferences", cookie)
  return ((await res.json()) as PreferencesBody).data.global[0]
}

async function fireStreamOnline() {
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
}

/** The fence user follows the broadcaster with no exclusion, so its delivery proves matching ran. */
async function seedFenceUser() {
  await orchestrator.seed({
    user: {},
    followedChannels: FOLLOWED,
    preferences: GLOBAL(),
    pushSubscriptions: [
      { endpoint: orchestrator.pushEndpoint("/push/exclusion-fence") },
    ],
  })
  await orchestrator.seedChannelState([
    { broadcasterUserId: BROADCASTER_ID, isLive: false },
  ])
  await orchestrator.mockTwitch.onAppToken()
  await orchestrator.mockTwitch.onStreams([STREAM])
  await orchestrator.mockTwitch.onPush("/push/exclusion-fence")
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("global preference exclusions API", () => {
  async function setup() {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      followedChannels: FOLLOWED,
      preferences: GLOBAL(),
    })
    const preference = await getGlobalPreference(cookie)
    return { cookie, preference }
  }

  it("should create, return the existing row, soft-disable and revive, embedding active ones in GET /preferences", async () => {
    const { cookie, preference } = await setup()
    const path = `/preferences/global/${preference.id}/exclusions`
    const body = { broadcaster_user_id: BROADCASTER_ID }

    const created = await api(path, cookie, "POST", body)
    expect(created.status).toBe(201)
    const { data } = (await created.json()) as { data: { id: string } }
    expect((await getGlobalPreference(cookie)).exclusions).toEqual([
      expect.objectContaining({
        id: data.id,
        broadcaster_user_id: BROADCASTER_ID,
      }),
    ])

    const again = await api(path, cookie, "POST", body)
    expect(again.status).toBe(200)
    expect(((await again.json()) as { data: { id: string } }).data.id).toBe(
      data.id,
    )

    const del = await api(`${path}/${data.id}`, cookie, "DELETE")
    expect(del.status).toBe(204)
    expect((await getGlobalPreference(cookie)).exclusions).toHaveLength(0)

    const revived = await api(path, cookie, "POST", body)
    expect(revived.status).toBe(200)
    expect((await getGlobalPreference(cookie)).exclusions).toHaveLength(1)
  })

  it("should keep exclusions when the global preference is disabled and revived", async () => {
    const { cookie, preference } = await setup()
    await api(
      `/preferences/global/${preference.id}/exclusions`,
      cookie,
      "POST",
      {
        broadcaster_user_id: BROADCASTER_ID,
      },
    )

    await api(`/preferences/global/${preference.id}`, cookie, "DELETE")
    // Reviving re-monitors the user's followed broadcasters.
    await orchestrator.mockTwitch.onStreams([STREAM])
    const revive = await api("/preferences/global", cookie, "POST", {
      category_id: MINECRAFT.id,
      category_name: MINECRAFT.name,
    })
    expect(revive.status).toBe(200)

    expect((await getGlobalPreference(cookie)).exclusions).toHaveLength(1)
  })

  it("should reject an exclusion on another user's preference", async () => {
    const { preference } = await setup()
    const other = await orchestrator.createAuthenticatedSession({
      id: "usr_other_excl",
      twitchUserId: "twitch_other_excl",
    })
    const res = await api(
      `/preferences/global/${preference.id}/exclusions`,
      other.cookie,
      "POST",
      { broadcaster_user_id: BROADCASTER_ID },
    )
    expect(res.status).toBe(404)
  })

  it("should reject excluding a broadcaster the user does not follow", async () => {
    const { cookie, preference } = await setup()
    const res = await api(
      `/preferences/global/${preference.id}/exclusions`,
      cookie,
      "POST",
      { broadcaster_user_id: "999" },
    )
    expect(res.status).toBe(400)
  })
})

describe("global preference exclusions at match time", () => {
  it("should not notify through an excluding global preference, but notify other followers", async () => {
    await seedFenceUser()
    await orchestrator.seed({
      user: { id: "usr_excluder", twitchUserId: "twitch_excluder" },
      followedChannels: FOLLOWED,
      preferences: GLOBAL([BROADCASTER_ID]),
    })

    await fireStreamOnline()

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
    expect(state.notificationDeliveries[0].user_id).toBe(E2E_USER_ID)
  })

  it("should still notify through a channel preference for the excluded broadcaster", async () => {
    await orchestrator.seed({
      user: {},
      followedChannels: FOLLOWED,
      preferences: {
        ...GLOBAL([BROADCASTER_ID]),
        channel: [
          {
            broadcasterUserId: BROADCASTER_ID,
            categoryId: MINECRAFT.id,
            categoryName: MINECRAFT.name,
          },
        ],
      },
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/exclusion-channel") },
      ],
    })
    await orchestrator.seedChannelState([
      { broadcasterUserId: BROADCASTER_ID, isLive: false },
    ])
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onStreams([STREAM])
    await orchestrator.mockTwitch.onPush("/push/exclusion-channel")

    await fireStreamOnline()

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some((d) => d.status === "sent"),
    )
    expect(state.notificationDeliveries).toHaveLength(1)
  })

  it("should still fire a snooze reminder for an excluded broadcaster", async () => {
    await orchestrator.seed({
      user: {},
      followedChannels: FOLLOWED,
      preferences: GLOBAL([BROADCASTER_ID]),
      pushSubscriptions: [
        { endpoint: orchestrator.pushEndpoint("/push/exclusion-snooze") },
      ],
    })
    await orchestrator.mockTwitch.onPush("/push/exclusion-snooze")
    await orchestrator.seedNotificationSnoozes([
      {
        broadcasterUserId: BROADCASTER_ID,
        categoryId: MINECRAFT.id,
        fireAt: new Date(Date.now() - 1000).toISOString(),
      },
    ])
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: BROADCASTER_ID,
        isLive: true,
        streamId: STREAM.id,
        categoryId: MINECRAFT.id,
        categoryName: MINECRAFT.name,
      },
    ])

    await orchestrator.runScheduled()

    const state = await orchestrator.waitForInspect([BROADCASTER_ID], (s) =>
      s.notificationDeliveries.some(
        (d) => d.trigger_type === "snooze_reminder" && d.status === "sent",
      ),
    )
    expect(state.notificationSnoozes[0].status).toBe("fired")
  })
})
