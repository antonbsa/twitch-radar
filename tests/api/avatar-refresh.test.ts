import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Database } from "../../apps/api/src/db"
import type { AppConfig } from "../../apps/api/src/env"
import { logger } from "../../apps/api/src/logger"
import {
  isAvatarRefreshSlot,
  refreshBroadcasterAvatars,
} from "../../apps/api/src/services/twitch/avatar-refresh"
import { orchestrator } from "./setup/orchestrator"
import { MOCK_TWITCH_URL } from "./setup/ports"

// The refresh is date-gated inside the hourly follow-sync trigger, and
// wrangler's /__scheduled can't set scheduledTime, so the job is called
// directly: real Get Users calls against the mock Twitch server, fake db.

describe("isAvatarRefreshSlot", () => {
  it.each([
    ["2026-11-01T04:10:00Z", true],
    ["2026-11-01T04:59:59Z", true],
    ["2026-11-01T03:10:00Z", false],
    ["2026-11-01T05:10:00Z", false],
    ["2026-11-02T04:10:00Z", false],
  ])("%s -> %s", (iso, expected) => {
    expect(isAvatarRefreshSlot(Date.parse(iso))).toBe(expected)
  })
})

describe("refreshBroadcasterAvatars", () => {
  const config = {
    twitchClientId: "client-id",
    twitchApiBaseUrl: MOCK_TWITCH_URL,
  } as AppConfig
  // A cached app token, so the job never hits /oauth2/token.
  const kv = {
    get: vi.fn().mockResolvedValue("app-access-token"),
  } as unknown as KVNamespace

  function fakeDb(broadcasterUserIds: string[]) {
    const updateProfileImageUrls = vi.fn().mockResolvedValue(undefined)
    const db = {
      followedChannels: {
        listDistinctBroadcasterUserIds: vi
          .fn()
          .mockResolvedValue(broadcasterUserIds),
        updateProfileImageUrls,
      },
    } as unknown as Database
    return { db, updateProfileImageUrls }
  }

  beforeEach(async () => {
    await orchestrator.mockTwitch.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("refreshes every followed broadcaster in Get Users calls of 100 ids", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `${9000 + i}`)
    const users = ids.map((id) => ({
      id,
      profile_image_url: `https://example.test/${id}-new.png`,
    }))
    await orchestrator.mockTwitch.onUsersByIds(users.slice(0, 100))
    await orchestrator.mockTwitch.onUsersByIds(users.slice(100))
    const { db, updateProfileImageUrls } = fakeDb(ids)

    await refreshBroadcasterAvatars(db, config, kv)

    const lookups = await orchestrator.mockTwitch.requests()
    expect(lookups.map((url) => url.split("id=").length - 1)).toEqual([100, 50])
    expect(updateProfileImageUrls).toHaveBeenCalledWith(
      users.map((u) => ({
        broadcasterUserId: u.id,
        profileImageUrl: u.profile_image_url,
      })),
    )
  })

  it("logs a Get Users failure without throwing or writing", async () => {
    await orchestrator.mockTwitch.onUsersByIds([], 500)
    const { db, updateProfileImageUrls } = fakeDb(["100"])
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {})

    await expect(
      refreshBroadcasterAvatars(db, config, kv),
    ).resolves.toBeUndefined()

    expect(updateProfileImageUrls).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      "Broadcaster avatar refresh failed",
      expect.objectContaining({ job: "avatar-refresh" }),
    )
  })
})
