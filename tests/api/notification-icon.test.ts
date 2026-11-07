import { describe, expect, it, vi } from "vitest"
import type { AppConfig } from "../../apps/api/src/env"
import { deliverNotification } from "../../apps/api/src/features/notifications/deliver"
import { sendWebPush } from "../../apps/api/src/features/push/web-push"
import type { Database } from "../../apps/api/src/db"
import type { ChannelStateChangeRecord } from "../../apps/api/src/db/repositories/channel-state-changes"
import type { ChannelStateRecord } from "../../apps/api/src/db/repositories/channel-state"
import { matchAndCreateDeliveries } from "../../apps/api/src/features/notifications/match"
import { sweepNotificationSnoozes } from "../../apps/api/src/features/notifications/snooze-sweep"
import type { NotificationJobMessage } from "../../apps/api/src/features/notifications/types"

vi.mock("../../apps/api/src/features/push/web-push", () => ({
  sendWebPush: vi.fn(),
}))

// The push payload is encrypted end-to-end (ADR 0035), so the avatar-as-icon
// field (issue #25) is asserted on the queued job message with a fake db.

const AVATAR = "https://static-cdn.jtvnw.net/avatar-300x300.png"

const LIVE_STATE: ChannelStateRecord = {
  broadcaster_user_id: "200",
  is_live: true,
  stream_id: "stream_1",
  category_id: "27471",
  category_name: "Minecraft",
  title: null,
  thumbnail_url: null,
  viewer_count: null,
  started_at: null,
  category_started_at: null,
  stream_type: "live",
  last_live_at: null,
  last_category_id: null,
  last_category_name: null,
  updated_from_event_at: null,
  updated_at: "2024-06-01T12:00:00Z",
}

function fakeDb(avatarUrl: string | null) {
  return {
    channelState: {
      findByBroadcasterUserId: vi.fn().mockResolvedValue(LIVE_STATE),
    },
    channelCategoryPreferences: {
      findActiveByBroadcasterAndCategory: vi
        .fn()
        .mockResolvedValue([{ user_id: "usr_1" }]),
    },
    globalCategoryPreferences: {
      findActiveByCategoryId: vi.fn().mockResolvedValue([]),
    },
    monitoredChannels: {
      findByBroadcasterUserIds: vi.fn().mockResolvedValue([
        {
          broadcaster_display_name: "ChannelB",
          broadcaster_login: "channelb",
        },
      ]),
    },
    followedChannels: {
      findProfileImageUrl: vi.fn().mockResolvedValue(avatarUrl),
    },
    users: {
      findLanguagesByIds: vi.fn().mockResolvedValue(new Map([["usr_1", "en"]])),
      findPausedUserIds: vi.fn().mockResolvedValue(new Set()),
    },
    broadcasterMutes: {
      findMutedUserIds: vi.fn().mockResolvedValue(new Set()),
    },
    notificationDeliveries: {
      findLastSentAtByUsers: vi.fn().mockResolvedValue(new Map()),
      insertPendingForUsers: vi
        .fn()
        .mockResolvedValue([
          { id: "dlv_1", user_id: "usr_1", status: "pending" },
        ]),
      insertSnoozeReminder: vi
        .fn()
        .mockResolvedValue({ id: "dlv_1", status: "pending" }),
    },
    notificationSnoozes: {
      findDue: vi.fn().mockResolvedValue([
        {
          id: "snz_1",
          user_id: "usr_1",
          broadcaster_user_id: "200",
          category_id: "27471",
          fire_at: "2024-06-01T12:00:00Z",
          status: "pending",
          created_at: "2024-06-01T11:45:00Z",
        },
      ]),
      claimForFiring: vi.fn().mockResolvedValue(true),
      markExpired: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Database
}

function fakeQueue() {
  const send = vi.fn().mockResolvedValue(undefined)
  const sendBatch = vi.fn().mockResolvedValue(undefined)
  return {
    queue: { send, sendBatch } as unknown as Queue<NotificationJobMessage>,
    sentPayload: () =>
      send.mock.calls.length > 0
        ? (send.mock.calls[0]![0] as NotificationJobMessage).payload
        : (
            sendBatch.mock.calls[0]![0] as { body: NotificationJobMessage }[]
          )[0]!.body.payload,
  }
}

const CHANGE: ChannelStateChangeRecord = {
  id: "chg_1",
  broadcaster_user_id: "200",
  eventsub_message_id: "msg_1",
  change_type: "stream_started",
  previous_is_live: false,
  next_is_live: true,
  previous_category_id: null,
  previous_category_name: null,
  next_category_id: "27471",
  next_category_name: "Minecraft",
  stream_id: "stream_1",
  occurred_at: "2024-06-01T12:00:00Z",
  created_at: "2024-06-01T12:00:00Z",
}

describe("notification payload icon", () => {
  it("carries the broadcaster avatar on a live alert", async () => {
    const { queue, sentPayload } = fakeQueue()
    await matchAndCreateDeliveries(fakeDb(AVATAR), queue, CHANGE)
    expect(sentPayload().icon).toBe(AVATAR)
  })

  it("omits icon on a live alert when no avatar is stored", async () => {
    const { queue, sentPayload } = fakeQueue()
    await matchAndCreateDeliveries(fakeDb(null), queue, CHANGE)
    expect(sentPayload()).not.toHaveProperty("icon")
  })

  it("carries the broadcaster avatar on a snooze reminder", async () => {
    const { queue, sentPayload } = fakeQueue()
    await sweepNotificationSnoozes(fakeDb(AVATAR), queue)
    expect(sentPayload().icon).toBe(AVATAR)
  })
})

describe("deliverNotification post-send write failure", () => {
  it("resolves instead of throwing so the queue does not re-push", async () => {
    vi.mocked(sendWebPush).mockResolvedValue({ ok: true, status: 201 })
    const db = {
      notificationDeliveries: {
        findById: vi.fn().mockResolvedValue({ id: "dlv_1", status: "pending" }),
        markSent: vi.fn().mockRejectedValue(new Error("D1 down")),
      },
      pushSubscriptions: {
        listActiveByUserId: vi.fn().mockResolvedValue([{ id: "psub_1" }]),
      },
    } as unknown as Database
    const message = {
      deliveryId: "dlv_1",
      userId: "usr_1",
      payload: { broadcasterUserId: "200" },
    } as unknown as NotificationJobMessage

    await expect(
      deliverNotification(db, {} as AppConfig, message),
    ).resolves.toBeUndefined()
    expect(sendWebPush).toHaveBeenCalledTimes(1)
  })
})
