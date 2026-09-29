import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { logger, serializeError } from "../../logger"
import { ensureMonitoredBroadcasters } from "../monitoring"
import {
  buildFollowedChannelsView,
  type FollowedChannelViewItem,
} from "../followed-channels-view"
import {
  getAllFollowedChannels,
  getAllFollowedStreams,
  resolveThumbnailUrl,
  type TwitchFollowedChannel,
  type TwitchFollowedStream,
} from "./client"
import { getValidAccessToken } from "./token-refresh"

// A user's follow list drives which broadcasters their global preferences
// monitor (ADR 0007) — refresh it daily even when they don't open the app.
const FOLLOW_SYNC_STALE_MS = 24 * 60 * 60 * 1000

// Each sync is several paginated Twitch calls plus monitoring maintenance;
// keep a run's subrequest usage bounded and let later runs take the rest.
const MAX_FOLLOW_SYNCS_PER_RUN = 3

export interface FollowedChannelsSyncFetch {
  channels: TwitchFollowedChannel[]
  streamByBroadcasterId: Map<string, TwitchFollowedStream>
  payload: FollowedChannelViewItem[]
}

/**
 * Twitch side of a follow sync only: the paginated follows/streams fetch,
 * shaped into the same response payload `GET /channels/followed` returns
 * (issue #83) — no D1 access, so callers can respond with `payload` before
 * persisting anything.
 */
export async function fetchFollowedChannelsSync(
  config: AppConfig,
  twitchUserId: string,
  accessToken: string,
): Promise<FollowedChannelsSyncFetch> {
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

  const payload = buildFollowedChannelsView(
    channels.map((ch) => ({
      broadcaster_user_id: ch.broadcaster_id,
      broadcaster_login: ch.broadcaster_login,
      broadcaster_display_name: ch.broadcaster_name,
      // Twitch's followed-channels endpoint doesn't return a profile image;
      // followedChannels.upsertAll below leaves the column null the same way.
      broadcaster_profile_image_url: null,
      followed_at: ch.followed_at,
    })),
    new Map(
      channels.map((ch) => {
        const stream = streamByBroadcasterId.get(ch.broadcaster_id)
        return [
          ch.broadcaster_id,
          stream
            ? {
                is_live: true,
                stream_id: stream.id,
                category_id: stream.game_id || null,
                category_name: stream.game_name || null,
                title: stream.title || null,
                thumbnail_url: resolveThumbnailUrl(stream.thumbnail_url),
                viewer_count: stream.viewer_count,
                started_at: stream.started_at,
              }
            : {
                is_live: false,
                stream_id: null,
                category_id: null,
                category_name: null,
                title: null,
                thumbnail_url: null,
                viewer_count: null,
                started_at: null,
              },
        ]
      }),
    ),
  )

  return { channels, streamByBroadcasterId, payload }
}

/**
 * D1 side of a follow sync: writes `followedChannels`/`channelState`, keeps
 * the monitored set current (ADR 0007), and stamps the user's last-sync
 * time. Split out from `fetchFollowedChannelsSync` so `POST /sync/follows`
 * can defer this behind `waitUntil` (issue #83) while still sharing it with
 * `syncFollowedChannels` for the scheduled path, which awaits it inline.
 */
async function persistFollowedChannelsSync(
  db: Database,
  config: AppConfig,
  userId: string,
  channels: TwitchFollowedChannel[],
  streamByBroadcasterId: Map<string, TwitchFollowedStream>,
  now: string,
): Promise<void> {
  // followedChannels and channelState write different tables with no
  // dependency on each other's result — run them concurrently instead of
  // stacking two sequential D1 round trips.
  await Promise.all([
    db.followedChannels.upsertAll(
      channels.map((ch) => ({
        userId,
        broadcasterUserId: ch.broadcaster_id,
        broadcasterLogin: ch.broadcaster_login,
        broadcasterDisplayName: ch.broadcaster_name,
        followedAt: ch.followed_at,
        now,
      })),
    ),
    db.channelState.upsertAll(
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
              thumbnailUrl: resolveThumbnailUrl(stream.thumbnail_url),
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
              thumbnailUrl: null,
              viewerCount: null,
              startedAt: null,
              now,
            }
      }),
    ),
  ])

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
 * Full follow sync used by the scheduled path (`syncStaleFollows`), which
 * has no HTTP response to hurry: fetches from Twitch and persists to D1
 * inline, returning the same payload shape `POST /sync/follows` responds
 * with.
 */
export async function syncFollowedChannels(
  db: Database,
  config: AppConfig,
  userId: string,
  twitchUserId: string,
  accessToken: string,
): Promise<FollowedChannelViewItem[]> {
  const now = new Date().toISOString()
  const { channels, streamByBroadcasterId, payload } =
    await fetchFollowedChannelsSync(config, twitchUserId, accessToken)
  await persistFollowedChannelsSync(
    db,
    config,
    userId,
    channels,
    streamByBroadcasterId,
    now,
  )
  return payload
}

/**
 * Persists a fetch already resolved by `fetchFollowedChannelsSync`, logging
 * (not throwing) on failure. Meant to run inside `c.executionCtx.waitUntil`
 * after `POST /sync/follows` has already responded (issue #83) — a failure
 * here leaves the UI briefly ahead of D1 until the user's next sync, an
 * accepted residual risk, so this only needs to be diagnosable, not
 * recovered from automatically.
 */
export async function persistFollowedChannelsSyncDeferred(
  db: Database,
  config: AppConfig,
  userId: string,
  fetched: FollowedChannelsSyncFetch,
  now: string,
): Promise<void> {
  try {
    await persistFollowedChannelsSync(
      db,
      config,
      userId,
      fetched.channels,
      fetched.streamByBroadcasterId,
      now,
    )
  } catch (error) {
    logger.error("Deferred follow sync write failed", {
      userId,
      channelCount: fetched.channels.length,
      ...serializeError(error),
    })
  }
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
  try {
    const userIds = await db.globalCategoryPreferences.listUserIdsWithActive()
    const cutoff = Date.now() - FOLLOW_SYNC_STALE_MS
    let attempted = 0
    let succeeded = 0

    for (const userId of userIds) {
      if (attempted >= MAX_FOLLOW_SYNCS_PER_RUN) break
      try {
        const user = await db.users.findById(userId)
        if (!user) continue
        if (
          user.last_follow_sync_at &&
          Date.parse(user.last_follow_sync_at) > cutoff
        ) {
          continue
        }

        attempted += 1
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
  } catch (error) {
    // Covers a D1 read failure (listUserIdsWithActive) or anything else
    // thrown outside the per-user handling above, so it's logged with full
    // detail instead of escaping as Cloudflare's bare automatic exception
    // capture.
    logger.error("Scheduled follow sync run failed", {
      ...serializeError(error),
    })
  }
}
