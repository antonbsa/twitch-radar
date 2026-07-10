import { afterAll, beforeEach, describe, expect, it } from "vitest"
import {
  CRON_EVENTSUB_RECONCILE,
  CRON_FOLLOW_SYNC,
  CRON_TOKEN_REFRESH,
} from "../../apps/api/src/crons"
import { orchestrator } from "./setup/orchestrator"

const BROADCASTER_ID = "300"

// Derived from .env.development's API_URL — the callback the worker under
// test stamps on its subscriptions and uses as its reconciliation ownership
// marker (ADR 0036).
const CALLBACK_URL = "http://localhost:8787/api/webhooks/twitch/eventsub"

function remoteSub(
  overrides: Partial<
    Parameters<
      typeof orchestrator.mockTwitch.onEventsubSubscriptionList
    >[0][number]
  > = {},
) {
  return {
    id: "tsub_r1",
    status: "enabled",
    type: "stream.online",
    broadcaster_user_id: BROADCASTER_ID,
    callback: CALLBACK_URL,
    ...overrides,
  }
}

beforeEach(async () => {
  await orchestrator.clearDatabase()
  await orchestrator.mockTwitch.reset()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("EventSub reconciliation", () => {
  it("should reset a row to pending when its Twitch subscription is missing", async () => {
    await orchestrator.seed({
      monitoredChannels: [{ broadcasterUserId: BROADCASTER_ID }],
      eventsubSubscriptions: [
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.online",
          status: "enabled",
          twitchSubscriptionId: "tsub_r1",
        },
      ],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([])

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    const online = state.eventsubSubscriptions.find(
      (s) => s.event_type === "stream.online",
    )
    expect(online).toMatchObject({
      status: "pending",
      twitch_subscription_id: null,
    })
  })

  it("should stage missing rows for a monitored broadcaster", async () => {
    await orchestrator.seed({
      monitoredChannels: [{ broadcasterUserId: BROADCASTER_ID }],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([])

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions).toHaveLength(3)
    for (const sub of state.eventsubSubscriptions) {
      expect(sub.status).toBe("pending")
    }
  })

  it("should remove local rows and Twitch subscriptions for a disabled broadcaster", async () => {
    await orchestrator.seed({
      monitoredChannels: [
        { broadcasterUserId: BROADCASTER_ID, disabled: true },
      ],
      eventsubSubscriptions: [
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.online",
          status: "enabled",
          twitchSubscriptionId: "tsub_r1",
        },
        // A row disabled before the creation job picked it up (ADR 0031's
        // known leftover) — reconciliation is the janitor that removes it.
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.offline",
          status: "pending",
        },
      ],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([remoteSub()])
    await orchestrator.mockTwitch.onEventsubSubscriptionDelete()

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.eventsubSubscriptions).toHaveLength(0)
  })

  it("should mirror Twitch's status onto a stale local row", async () => {
    await orchestrator.seed({
      monitoredChannels: [{ broadcasterUserId: BROADCASTER_ID }],
      eventsubSubscriptions: [
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.online",
          status: "webhook_callback_verification_pending",
          twitchSubscriptionId: "tsub_r1",
        },
      ],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([
      remoteSub({ status: "enabled" }),
    ])

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    const online = state.eventsubSubscriptions.find(
      (s) => s.event_type === "stream.online",
    )
    expect(online?.status).toBe("enabled")
  })

  it("should delete an unhealthy Twitch subscription and re-stage the row", async () => {
    await orchestrator.seed({
      monitoredChannels: [{ broadcasterUserId: BROADCASTER_ID }],
      eventsubSubscriptions: [
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.online",
          status: "enabled",
          twitchSubscriptionId: "tsub_r1",
        },
      ],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([
      remoteSub({ status: "notification_failures_exceeded" }),
    ])
    await orchestrator.mockTwitch.onEventsubSubscriptionDelete()

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    const online = state.eventsubSubscriptions.find(
      (s) => s.event_type === "stream.online",
    )
    expect(online).toMatchObject({
      status: "pending",
      twitch_subscription_id: null,
    })
  })

  it("should treat a subscription with a foreign callback as not ours", async () => {
    // Same Twitch app, different deployment: its subscription must not count
    // as coverage for our row (which gets re-staged) nor be deleted (no
    // delete mock is queued — an attempted delete would 500 into the log).
    await orchestrator.seed({
      monitoredChannels: [{ broadcasterUserId: BROADCASTER_ID }],
      eventsubSubscriptions: [
        {
          broadcasterUserId: BROADCASTER_ID,
          eventType: "stream.online",
          status: "enabled",
          twitchSubscriptionId: "tsub_r1",
        },
      ],
    })
    await orchestrator.mockTwitch.onAppToken()
    await orchestrator.mockTwitch.onEventsubSubscriptionList([
      remoteSub({
        callback: "https://other-env.example.com/api/webhooks/twitch/eventsub",
      }),
    ])

    await orchestrator.runScheduled(CRON_EVENTSUB_RECONCILE)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    const online = state.eventsubSubscriptions.find(
      (s) => s.event_type === "stream.online",
    )
    expect(online).toMatchObject({
      status: "pending",
      twitch_subscription_id: null,
    })
  })
})

describe("Twitch token refresh", () => {
  it("should proactively refresh an expiring token", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange({
      access_token: "refreshed-access-token",
      refresh_token: "refreshed-refresh-token",
      expires_in: 14400,
      scope: ["user:read:follows"],
      token_type: "bearer",
    })

    await orchestrator.runScheduled(CRON_TOKEN_REFRESH)

    const me = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })
    expect(me.status).toBe(200)
    const body = (await me.json()) as {
      data: { twitch_reconnect_required: boolean }
    }
    expect(body.data.twitch_reconnect_required).toBe(false)

    // The refreshed token must be stored: a sync now succeeds without any
    // further token exchange mocked (a second refresh attempt would 500
    // against the drained mock and fail the request).
    await orchestrator.mockTwitch.onFollowedChannels([])
    await orchestrator.mockTwitch.onFollowedStreams([])
    const sync = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(sync.status).toBe(200)
  })

  it("should surface reconnect state when the scheduled refresh fails", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange(
      { message: "Invalid refresh token" },
      400,
    )

    await orchestrator.runScheduled(CRON_TOKEN_REFRESH)

    const me = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })
    const body = (await me.json()) as {
      data: { twitch_reconnect_required: boolean }
    }
    expect(body.data.twitch_reconnect_required).toBe(true)
  })

  it("should surface reconnect state when an on-demand refresh fails", async () => {
    const { cookie } = await orchestrator.createAuthenticatedSession({
      expiredToken: true,
    })
    await orchestrator.mockTwitch.onTokenExchange(
      { message: "Invalid refresh token" },
      401,
    )

    const sync = await fetch(`${orchestrator.baseUrl}/api/sync/follows`, {
      method: "POST",
      headers: { Cookie: cookie },
    })
    expect(sync.status).toBe(401)
    await expect(sync.json()).resolves.toMatchObject({
      error: { code: "reconnect_required" },
    })

    const me = await fetch(`${orchestrator.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    })
    const body = (await me.json()) as {
      data: { twitch_reconnect_required: boolean }
    }
    expect(body.data.twitch_reconnect_required).toBe(true)
  })
})

describe("scheduled follow sync", () => {
  it("should re-sync stale follows for users with active global preferences", async () => {
    await orchestrator.createAuthenticatedSession()
    await orchestrator.seed({
      preferences: {
        global: [{ categoryId: "27471", categoryName: "Minecraft" }],
      },
    })
    await orchestrator.mockTwitch.onFollowedChannels([
      {
        broadcaster_id: BROADCASTER_ID,
        broadcaster_login: "channelx",
        broadcaster_name: "ChannelX",
      },
    ])
    await orchestrator.mockTwitch.onFollowedStreams([])

    await orchestrator.runScheduled(CRON_FOLLOW_SYNC)

    const state = await orchestrator.inspect([BROADCASTER_ID])
    expect(state.monitoredChannels).toHaveLength(1)
    expect(state.monitoredChannels[0]).toMatchObject({
      monitor_reason: "global_preference",
      disabled_at: null,
    })
    expect(state.eventsubSubscriptions).toHaveLength(3)
    expect(state.channelState).toHaveLength(1)
  })
})
