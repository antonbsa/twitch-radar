import { describe, expect, it, vi } from "vitest"
import type { Database } from "../../apps/api/src/db"
import type { ChannelStateChangeRecord } from "../../apps/api/src/db/repositories/channel-state-changes"
import { matchAndCreateDeliveries } from "../../apps/api/src/features/notifications/match"
import { sweepNotificationSnoozes } from "../../apps/api/src/features/notifications/snooze-sweep"
import type { NotificationJobMessage } from "../../apps/api/src/features/notifications/types"

// Window boundary and trigger/category independence of the send-side
// cooldown (ADR 0056), asserted on the queue with a fake db.

const MINUTE = 60_000
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * MINUTE).toISOString()

function fakeDb(lastSentAt: string | null, userIds = ["usr_1"]) {
  const findLastSent = vi
    .fn()
    .mockResolvedValue(new Map(lastSentAt ? [[userIds[0]!, lastSentAt]] : []))
  const insertPendingForUsers = vi
    .fn()
    .mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id: `dlv_${id}`, user_id: id, status: "pending" })),
    )
  const insertPendingIfNew = vi
    .fn()
    .mockResolvedValue({ id: "dlv_1", status: "pending" })
  const db = {
    channelState: {
      findByBroadcasterUserId: vi.fn().mockResolvedValue({
        stream_type: "live",
        is_live: true,
        category_id: "27471",
        title: null,
        thumbnail_url: null,
        started_at: null,
      }),
    },
    channelCategoryPreferences: {
      findActiveByBroadcasterAndCategory: vi
        .fn()
        .mockResolvedValue(userIds.map((id) => ({ user_id: id }))),
    },
    globalCategoryPreferences: {
      findActiveByCategoryId: vi.fn().mockResolvedValue([]),
    },
    monitoredChannels: {
      findByBroadcasterUserIds: vi
        .fn()
        .mockResolvedValue([{ broadcaster_login: "channeln" }]),
    },
    followedChannels: {
      findProfileImageUrl: vi.fn().mockResolvedValue(null),
    },
    users: {
      findLanguagesByIds: vi.fn().mockResolvedValue(new Map()),
      findPausedUserIds: vi.fn().mockResolvedValue(new Set()),
    },
    broadcasterMutes: {
      findMutedUserIds: vi.fn().mockResolvedValue(new Set()),
    },
    notificationDeliveries: {
      findLastSentAtByUsers: findLastSent,
      insertPendingForUsers,
      insertPendingIfNew,
    },
    notificationSnoozes: {
      findDue: vi.fn().mockResolvedValue([
        {
          id: "snz_1",
          user_id: "usr_1",
          broadcaster_user_id: "200",
          category_id: "27471",
          fire_at: minutesAgo(0),
          status: "pending",
          created_at: minutesAgo(15),
        },
      ]),
      markFired: vi.fn().mockResolvedValue(undefined),
      markExpired: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Database
  return { db, findLastSent, insertPendingForUsers, insertPendingIfNew }
}

function fakeQueue() {
  const send = vi.fn().mockResolvedValue(undefined)
  const sendBatch = vi.fn().mockResolvedValue(undefined)
  return {
    queue: { send, sendBatch } as unknown as Queue<NotificationJobMessage>,
    send,
    sendBatch,
  }
}

function change(
  overrides: Partial<ChannelStateChangeRecord> = {},
): ChannelStateChangeRecord {
  return {
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
    stream_id: "stream_2",
    occurred_at: minutesAgo(0),
    created_at: minutesAgo(0),
    ...overrides,
  }
}

describe("notification cooldown", () => {
  it("should stage a delivery when nothing was sent before", async () => {
    const { db } = fakeDb(null)
    const { queue, sendBatch } = fakeQueue()
    await matchAndCreateDeliveries(db, queue, change())
    expect(sendBatch).toHaveBeenCalledTimes(1)
  })

  it("should skip the user when the last send is inside the window", async () => {
    const { db, insertPendingForUsers } = fakeDb(minutesAgo(14))
    const { queue, sendBatch } = fakeQueue()
    await matchAndCreateDeliveries(db, queue, change())
    expect(insertPendingForUsers).toHaveBeenCalledWith([], expect.anything())
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it("should notify again once the last send is older than 15 minutes", async () => {
    const { db } = fakeDb(minutesAgo(16))
    const { queue, sendBatch } = fakeQueue()
    await matchAndCreateDeliveries(db, queue, change())
    expect(sendBatch).toHaveBeenCalledTimes(1)
  })

  it("should apply to a category switch regardless of the earlier trigger or category", async () => {
    const { db, findLastSent, insertPendingForUsers } = fakeDb(minutesAgo(1))
    const { queue } = fakeQueue()
    await matchAndCreateDeliveries(
      db,
      queue,
      change({ change_type: "category_changed", previous_category_id: "1" }),
    )
    expect(findLastSent).toHaveBeenCalledWith("200", ["usr_1"])
    expect(insertPendingForUsers).toHaveBeenCalledWith([], expect.anything())
  })

  it("should stage and enqueue only the users outside the cooldown in one batch", async () => {
    const { db, findLastSent, insertPendingForUsers } = fakeDb(minutesAgo(1), [
      "usr_1",
      "usr_2",
      "usr_3",
    ])
    const { queue, send, sendBatch } = fakeQueue()
    await matchAndCreateDeliveries(db, queue, change())
    expect(findLastSent).toHaveBeenCalledTimes(1)
    expect(insertPendingForUsers).toHaveBeenCalledTimes(1)
    expect(insertPendingForUsers).toHaveBeenCalledWith(["usr_2", "usr_3"], {
      broadcasterUserId: "200",
      categoryId: "27471",
      triggerType: "stream_started_in_category",
      eventsubMessageId: "msg_1",
      streamId: "stream_2",
      now: expect.any(String),
    })
    expect(send).not.toHaveBeenCalled()
    expect(sendBatch).toHaveBeenCalledTimes(1)
    const jobs = sendBatch.mock.calls[0]![0] as {
      body: NotificationJobMessage
    }[]
    expect(jobs.map((j) => [j.body.deliveryId, j.body.userId])).toEqual([
      ["dlv_usr_2", "usr_2"],
      ["dlv_usr_3", "usr_3"],
    ])
  })

  it("should not hold back a snooze reminder", async () => {
    const { db, findLastSent } = fakeDb(minutesAgo(1))
    const { queue, send } = fakeQueue()
    await sweepNotificationSnoozes(db, queue)
    expect(findLastSent).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
