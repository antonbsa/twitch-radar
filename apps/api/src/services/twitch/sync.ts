import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { logger, serializeError } from "../../logger"
import { ensureMonitoredBroadcasters } from "../monitoring"
import { getAllFollowedChannels, getAllFollowedStreams } from "./client"
import { getValidAccessToken } from "./token-refresh"

// A user's follow list drives which broadcasters their global preferences
// monitor (ADR 0007) — refresh it daily even when they don't open the app.
const FOLLOW_SYNC_STALE_MS = 24 * 60 * 60 * 1000

// Each sync is several paginated Twitch calls plus monitoring maintenance;
// keep a run's subrequest usage bounded and let later runs take the rest.
const MAX_FOLLOW_SYNCS_PER_RUN = 3

export async function syncFollowedChannels(
  db: Database,
  config: AppConfig,
  userId: string,
  twitchUserId: string,
  accessToken: string,
): Promise<void> {
  const now = new Date().toISOString()

  const [channels, streams] = await Promise.all([
    getAllFollowedChannels(
      config.twitchClientId,
      accessToken,
      twitchUserId,
      config.twitchApiBaseUrl,
    ),
    getAllFollowedStreams(
      config.twitchClientId,
      accessToken,
      twitchUserId,
      config.twitchApiBaseUrl,
    ),
  ])

  const streamByBroadcasterId = new Map(streams.map((s) => [s.user_id, s]))

  await db.followedChannels.upsertAll(
    channels.map((ch) => ({
      userId,
      broadcasterUserId: ch.broadcaster_id,
      broadcasterLogin: ch.broadcaster_login,
      broadcasterDisplayName: ch.broadcaster_name,
      followedAt: ch.followed_at,
      now,
    })),
  )

  await db.channelState.upsertAll(
    channels.map((ch) => {
      const stream = streamByBroadcasterId.get(ch.broadcaster_id)
      return stream
        ? {
            broadcasterUserId: ch.broadcaster_id,
            isLive: true,
            streamId: stream.id,
            categoryId: stream.game_id || null,
            categoryName: stream.game_name || null,
            title: stream.title || null,
            viewerCount: stream.viewer_count,
            startedAt: stream.started_at,
            now,
          }
        : {
            broadcasterUserId: ch.broadcaster_id,
            isLive: false,
            streamId: null,
            categoryId: null,
            categoryName: null,
            title: null,
            viewerCount: null,
            startedAt: null,
            now,
          }
    }),
  )

  // A user with an active global preference monitors all followed
  // broadcasters (ADR 0007) — keep the monitored set current as follows
  // change. Channel state for these rows was just seeded above, so the
  // ensure step only touches monitored_channels/eventsub_subscriptions.
  const globalPreferences =
    await db.globalCategoryPreferences.listActiveByUserId(userId)
  if (globalPreferences.length > 0) {
    await ensureMonitoredBroadcasters(
      db,
      config,
      userId,
      channels.map((ch) => ({
        broadcasterUserId: ch.broadcaster_id,
        broadcasterLogin: ch.broadcaster_login,
        broadcasterDisplayName: ch.broadcaster_name,
      })),
      "global_preference",
    )
  }

  await db.users.updateLastFollowSyncAt(userId, now, now)
}

/**
 * Scheduled refinement of follow sync (ADR 0036): re-syncs follows for users
 * whose active global preferences depend on an up-to-date follow list but
 * whose last sync is stale. Users whose tokens need reconnecting just log —
 * their monitored set freezes until they come back.
 */
export async function syncStaleFollows(
  db: Database,
  config: AppConfig,
): Promise<void> {
  const userIds = await db.globalCategoryPreferences.listUserIdsWithActive()
  const cutoff = Date.now() - FOLLOW_SYNC_STALE_MS
  let attempted = 0
  let succeeded = 0

  for (const userId of userIds) {
    if (attempted >= MAX_FOLLOW_SYNCS_PER_RUN) break
    const user = await db.users.findById(userId)
    if (!user) continue
    if (
      user.last_follow_sync_at &&
      Date.parse(user.last_follow_sync_at) > cutoff
    ) {
      continue
    }

    attempted += 1
    try {
      const accessToken = await getValidAccessToken(db, config, userId)
      await syncFollowedChannels(
        db,
        config,
        userId,
        user.twitch_user_id,
        accessToken,
      )
      succeeded += 1
    } catch (error) {
      logger.error("Scheduled follow sync failed", {
        userId,
        ...serializeError(error),
      })
    }
  }

  logger.info("Scheduled follow sync run completed", {
    attempted,
    succeeded,
    failed: attempted - succeeded,
  })
}
