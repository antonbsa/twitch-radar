import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

const BROADCASTER_A = {
  broadcasterUserId: "100",
  broadcasterLogin: "channela",
  broadcasterDisplayName: "ChannelA",
}
const BROADCASTER_B = {
  broadcasterUserId: "200",
  broadcasterLogin: "channelb",
  broadcasterDisplayName: "ChannelB",
}
const CATEGORY = { id: "27471", name: "Minecraft" }
const STREAM_A = {
  id: "stream_1",
  user_id: "100",
  user_login: "channela",
  user_name: "ChannelA",
  game_id: "27471",
  game_name: "Minecraft",
  viewer_count: 500,
  started_at: "2024-06-01T12:00:00Z",
  title: "Building stuff",
}

function channelPrefBody(broadcasterUserId: string, category = CATEGORY) {
  return JSON.stringify({
    broadcaster_user_id: broadcasterUserId,
    category_id: category.id,
    category_name: category.name,
  })
}

function globalPrefBody(category = CATEGORY) {
  return JSON.stringify({
    category_id: category.id,
    category_name: category.name,
  })
}

async function postChannelPref(
  cookie: string,
  broadcasterUserId: string,
  category = CATEGORY,
) {
  return fetch(`${orchestrator.baseUrl}/api/preferences/channel`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: channelPrefBody(broadcasterUserId, category),
  })
}

async function postGlobalPref(cookie: string, category = CATEGORY) {
  return fetch(`${orchestrator.baseUrl}/api/preferences/global`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: globalPrefBody(category),
  })
}

async function getPreferences(cookie: string) {
  const res = await fetch(`${orchestrator.baseUrl}/api/preferences`, {
    headers: { Cookie: cookie },
  })
  expect(res.status).toBe(200)
  const { data } = (await res.json()) as {
    data: {
      channel: Array<{ id: string; broadcaster_user_id: string }>
      global: Array<{ id: string; category_id: string }>
    }
  }
  return data
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("GET /api/preferences", () => {
  it("should return empty lists for a fresh user", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    await expect(getPreferences(cookie)).resolves.toEqual({
      channel: [],
      global: [],
    })
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/preferences`)
    expect(res.status).toBe(401)
  })
})

describe("POST /api/preferences/channel", () => {
  it("should create a preference, monitor only that broadcaster, and seed live state", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [
      BROADCASTER_A,
      BROADCASTER_B,
    ])
    await orchestrator.mockTwitch.onStreams([STREAM_A])

    const res = await postChannelPref(cookie, "100")
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: Record<string, unknown> }
    expect(data).toMatchObject({
      broadcaster_user_id: "100",
      category_id: CATEGORY.id,
      category_name: CATEGORY.name,
    })

    const prefs = await getPreferences(cookie)
    expect(prefs.channel).toHaveLength(1)
    expect(prefs.global).toHaveLength(0)

    const state = await orchestrator.inspect(["100", "200"])
    // Per-channel preference monitors only the selected broadcaster (ADR 0007).
    expect(state.monitoredChannels).toHaveLength(1)
    expect(state.monitoredChannels[0]).toMatchObject({
      broadcaster_user_id: "100",
      monitor_reason: "channel_preference",
      disabled_at: null,
    })

    // One pending local EventSub row per monitored event type.
    expect(state.eventsubSubscriptions).toHaveLength(3)
    expect(
      state.eventsubSubscriptions.map((sub) => sub.event_type).sort(),
    ).toEqual(["channel.update", "stream.offline", "stream.online"])
    for (const sub of state.eventsubSubscriptions) {
      expect(sub.status).toBe("pending")
    }

    // channel_state was seeded from the mocked Get Streams response.
    expect(state.channelState).toHaveLength(1)
    expect(state.channelState[0]).toMatchObject({
      broadcaster_user_id: "100",
      is_live: true,
      stream_id: "stream_1",
      category_id: "27471",
      category_name: "Minecraft",
    })
  })

  it("should seed offline state when the broadcaster is not live", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])

    const res = await postChannelPref(cookie, "100")
    expect(res.status).toBe(201)

    const state = await orchestrator.inspect(["100"])
    expect(state.channelState).toHaveLength(1)
    expect(state.channelState[0]).toMatchObject({
      broadcaster_user_id: "100",
      is_live: false,
      stream_id: null,
    })
  })

  it("should not refetch or overwrite existing channel state (already-live matching stream)", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.seedChannelState([
      {
        broadcasterUserId: "100",
        isLive: true,
        streamId: "stream_existing",
        categoryId: CATEGORY.id,
        categoryName: CATEGORY.name,
      },
    ])
    // No /helix/streams mock queued: a fetch would 500, so a 201 here also
    // proves the already-seeded broadcaster wasn't re-fetched. Per ADR 0008,
    // no catch-up notification is produced either — the preference only
    // applies to future transitions.
    const res = await postChannelPref(cookie, "100")
    expect(res.status).toBe(201)

    const state = await orchestrator.inspect(["100"])
    expect(state.channelState[0]).toMatchObject({
      is_live: true,
      stream_id: "stream_existing",
    })
  })

  it("should be idempotent for the same user/channel/category", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])

    const first = await postChannelPref(cookie, "100")
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { data: { id: string } }

    const second = await postChannelPref(cookie, "100")
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { data: { id: string } }
    expect(secondBody.data.id).toBe(firstBody.data.id)

    const prefs = await getPreferences(cookie)
    expect(prefs.channel).toHaveLength(1)
  })

  it("should reject a broadcaster the user does not follow", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()

    const res = await postChannelPref(cookie, "999")
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    })

    const state = await orchestrator.inspect(["999"])
    expect(state.monitoredChannels).toHaveLength(0)
  })

  it("should return 401 without a session", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/preferences/channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: channelPrefBody("100"),
    })
    expect(res.status).toBe(401)
  })
})

describe("POST /api/preferences/global", () => {
  it("should create a preference and monitor all followed broadcasters", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [
      BROADCASTER_A,
      BROADCASTER_B,
    ])
    await orchestrator.mockTwitch.onStreams([STREAM_A])

    const res = await postGlobalPref(cookie)
    expect(res.status).toBe(201)

    const prefs = await getPreferences(cookie)
    expect(prefs.global).toHaveLength(1)

    const state = await orchestrator.inspect(["100", "200"])
    expect(state.monitoredChannels).toHaveLength(2)
    for (const monitored of state.monitoredChannels) {
      expect(monitored.monitor_reason).toBe("global_preference")
      expect(monitored.disabled_at).toBeNull()
    }
    // 3 event types per broadcaster.
    expect(state.eventsubSubscriptions).toHaveLength(6)
    // State seeded for both: A live from the mocked response, B offline.
    const stateA = state.channelState.find(
      (s) => s.broadcaster_user_id === "100",
    )!
    const stateB = state.channelState.find(
      (s) => s.broadcaster_user_id === "200",
    )!
    expect(stateA.is_live).toBe(true)
    expect(stateB.is_live).toBe(false)
  })

  it("should be idempotent for the same user/category", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])

    const first = await postGlobalPref(cookie)
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as { data: { id: string } }

    const second = await postGlobalPref(cookie)
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { data: { id: string } }
    expect(secondBody.data.id).toBe(firstBody.data.id)

    const prefs = await getPreferences(cookie)
    expect(prefs.global).toHaveLength(1)
  })

  it("should batch eventsub subscription creation for a large followed list and stay idempotent on retry", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    // Large enough to require multiple insert batches under the 9-params-
    // per-row chunking in ensurePending (100/9 = 11 rows per batch) and
    // multiple Get Streams batches (100 user_id per request).
    const BROADCASTER_COUNT = 250
    const broadcasters = Array.from({ length: BROADCASTER_COUNT }, (_, i) => ({
      broadcasterUserId: `${1000 + i}`,
      broadcasterLogin: `channel${i}`,
      broadcasterDisplayName: `Channel${i}`,
    }))
    await orchestrator.seedFollowedChannels(userId, broadcasters)
    // seedMissingChannelState batches Get Streams at 100 user_ids/request.
    await orchestrator.mockTwitch.onStreams([])
    await orchestrator.mockTwitch.onStreams([])
    await orchestrator.mockTwitch.onStreams([])

    const res = await postGlobalPref(cookie)
    expect(res.status).toBe(201)

    const broadcasterIds = broadcasters.map((b) => b.broadcasterUserId)
    const state = await orchestrator.inspect(broadcasterIds)
    expect(state.monitoredChannels).toHaveLength(BROADCASTER_COUNT)
    for (const monitored of state.monitoredChannels) {
      expect(monitored.monitor_reason).toBe("global_preference")
      expect(monitored.disabled_at).toBeNull()
    }
    expect(state.channelState).toHaveLength(BROADCASTER_COUNT)
    // 3 monitored event types per broadcaster, no duplicates.
    expect(state.eventsubSubscriptions).toHaveLength(BROADCASTER_COUNT * 3)

    // Re-creating the same preference re-runs ensureMonitoredBroadcasters
    // over the same broadcaster list; onConflictDoNothing must keep this
    // idempotent instead of erroring or duplicating pending rows. Channel
    // state is already seeded for all broadcasters, so no further Get
    // Streams calls are made here.
    const repeat = await postGlobalPref(cookie)
    expect(repeat.status).toBe(200)
    const stateAfterRepeat = await orchestrator.inspect(broadcasterIds)
    expect(stateAfterRepeat.monitoredChannels).toHaveLength(BROADCASTER_COUNT)
    expect(stateAfterRepeat.eventsubSubscriptions).toHaveLength(
      BROADCASTER_COUNT * 3,
    )
  }, 30_000)
})

describe("DELETE /api/preferences/channel/:id", () => {
  it("should remove the preference and disable monitoring when nothing else needs it", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])

    const created = await postChannelPref(cookie, "100")
    const { data } = (await created.json()) as { data: { id: string } }

    const res = await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/${data.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(res.status).toBe(204)

    const prefs = await getPreferences(cookie)
    expect(prefs.channel).toHaveLength(0)

    const state = await orchestrator.inspect(["100"])
    expect(state.monitoredChannels).toHaveLength(1)
    expect(state.monitoredChannels[0].disabled_at).not.toBeNull()

    // Repeating the delete is a no-op.
    const repeat = await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/${data.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(repeat.status).toBe(204)
  })

  it("should keep monitoring active while another user's preference needs the broadcaster", async () => {
    const userA = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userA.userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])
    const createdA = await postChannelPref(userA.cookie, "100")
    const { data: prefA } = (await createdA.json()) as {
      data: { id: string }
    }

    const userB = await orchestrator.createAuthenticatedSession({
      id: "usr_other",
      twitchUserId: "twitch_other_456",
      twitchLogin: "otheruser",
      twitchDisplayName: "OtherUser",
    })
    await orchestrator.seedFollowedChannels(userB.userId, [BROADCASTER_A])
    const createdB = await postChannelPref(userB.cookie, "100")
    expect(createdB.status).toBe(201)

    const res = await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/${prefA.id}`,
      { method: "DELETE", headers: { Cookie: userA.cookie } },
    )
    expect(res.status).toBe(204)

    const state = await orchestrator.inspect(["100"])
    expect(state.monitoredChannels[0].disabled_at).toBeNull()
  })

  it("should revive the same preference when re-created after deletion", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])

    const created = await postChannelPref(cookie, "100")
    const { data } = (await created.json()) as { data: { id: string } }

    await fetch(`${orchestrator.baseUrl}/api/preferences/channel/${data.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    })

    const recreated = await postChannelPref(cookie, "100")
    expect(recreated.status).toBe(200)
    const { data: revived } = (await recreated.json()) as {
      data: { id: string }
    }
    expect(revived.id).toBe(data.id)

    const state = await orchestrator.inspect(["100"])
    expect(state.monitoredChannels[0].disabled_at).toBeNull()
  })

  it("should return 404 for an unknown or foreign preference id", async () => {
    const userA = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userA.userId, [BROADCASTER_A])
    await orchestrator.mockTwitch.onStreams([])
    const created = await postChannelPref(userA.cookie, "100")
    const { data } = (await created.json()) as { data: { id: string } }

    const userB = await orchestrator.createAuthenticatedSession({
      id: "usr_other",
      twitchUserId: "twitch_other_456",
      twitchLogin: "otheruser",
      twitchDisplayName: "OtherUser",
    })

    const foreign = await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/${data.id}`,
      { method: "DELETE", headers: { Cookie: userB.cookie } },
    )
    expect(foreign.status).toBe(404)

    const unknown = await fetch(
      `${orchestrator.baseUrl}/api/preferences/channel/cpref_nope`,
      { method: "DELETE", headers: { Cookie: userA.cookie } },
    )
    expect(unknown.status).toBe(404)
  })
})

describe("DELETE /api/preferences/global/:id", () => {
  it("should disable monitoring only for broadcasters no other preference needs", async () => {
    const { cookie, userId } = await orchestrator.createAuthenticatedSession()
    await orchestrator.seedFollowedChannels(userId, [
      BROADCASTER_A,
      BROADCASTER_B,
    ])
    await orchestrator.mockTwitch.onStreams([])

    // Channel preference pins broadcaster A; the global preference covers both.
    const channelCreated = await postChannelPref(cookie, "100")
    expect(channelCreated.status).toBe(201)
    // The global create seeds state for B (A already has a row from above).
    await orchestrator.mockTwitch.onStreams([])
    const globalCreated = await postGlobalPref(cookie, {
      id: "509658",
      name: "Just Chatting",
    })
    const { data: globalPref } = (await globalCreated.json()) as {
      data: { id: string }
    }

    const res = await fetch(
      `${orchestrator.baseUrl}/api/preferences/global/${globalPref.id}`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(res.status).toBe(204)

    const prefs = await getPreferences(cookie)
    expect(prefs.global).toHaveLength(0)
    expect(prefs.channel).toHaveLength(1)

    const state = await orchestrator.inspect(["100", "200"])
    const monitoredA = state.monitoredChannels.find(
      (m) => m.broadcaster_user_id === "100",
    )!
    const monitoredB = state.monitoredChannels.find(
      (m) => m.broadcaster_user_id === "200",
    )!
    // A is still required by the channel preference; B is not.
    expect(monitoredA.disabled_at).toBeNull()
    expect(monitoredB.disabled_at).not.toBeNull()
  })

  it("should return 404 for an unknown preference id", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    const res = await fetch(
      `${orchestrator.baseUrl}/api/preferences/global/gpref_nope`,
      { method: "DELETE", headers: { Cookie: cookie } },
    )
    expect(res.status).toBe(404)
  })
})

describe("monitoring upkeep on follow sync", () => {
  it("should extend monitoring to newly followed broadcasters for users with a global preference", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession()
    // Global preference created before any follows exist: nothing to monitor yet.
    const created = await postGlobalPref(cookie)
    expect(created.status).toBe(201)

    await orchestrator.mockTwitch.onFollowedChannels([
      {
        broadcaster_id: "100",
        broadcaster_login: "channela",
        broadcaster_name: "ChannelA",
      },
      {
        broadcaster_id: "200",
        broadcaster_login: "channelb",
        broadcaster_name: "ChannelB",
      },
    ])
    await orchestrator.mockTwitch.onFollowedStreams([])

    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)

    const state = await orchestrator.inspect(["100", "200"])
    expect(state.monitoredChannels).toHaveLength(2)
    for (const monitored of state.monitoredChannels) {
      expect(monitored.monitor_reason).toBe("global_preference")
      expect(monitored.disabled_at).toBeNull()
    }
  })
})
