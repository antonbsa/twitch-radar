import { afterEach, describe, expect, it, vi } from "vitest"
import type { Database } from "../../apps/api/src/db"
import type { AppConfig } from "../../apps/api/src/env"
import { logger } from "../../apps/api/src/logger"
import { persistFollowedChannelsSyncDeferred } from "../../apps/api/src/services/twitch/sync"

// Unit-level coverage for the waitUntil failure path (issue #83): once
// POST /sync/follows has already responded, a D1 write failure here has no
// HTTP request left to surface through, so this exercises the catch/log
// contract directly rather than through a real D1 constraint violation.
describe("persistFollowedChannelsSyncDeferred", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs the failure instead of letting it escape the waitUntil task", async () => {
    const writeError = new Error("D1 write failed")
    const db = {
      followedChannels: { upsertAll: vi.fn().mockRejectedValue(writeError) },
      channelState: { upsertAll: vi.fn().mockResolvedValue(undefined) },
      globalCategoryPreferences: {
        listActiveByUserId: vi.fn().mockResolvedValue([]),
      },
      users: { updateLastFollowSyncAt: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Database
    const config = {} as AppConfig
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {})

    await expect(
      persistFollowedChannelsSyncDeferred(
        db,
        config,
        "usr_1",
        {
          channels: [
            {
              broadcaster_id: "100",
              broadcaster_login: "channela",
              broadcaster_name: "ChannelA",
              followed_at: "2024-01-01T00:00:00Z",
            },
          ],
          streamByBroadcasterId: new Map(),
          payload: [],
        },
        "2024-01-01T00:00:00Z",
      ),
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [message, fields] = errorSpy.mock.calls[0]!
    expect(message).toBe("Deferred follow sync write failed")
    expect(fields).toMatchObject({
      userId: "usr_1",
      channelCount: 1,
      error: writeError.message,
    })
  })
})
