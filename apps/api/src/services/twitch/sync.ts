import { scheduledJobLogFields } from "../../crons"
import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { logger, serializeError } from "../../lib/logger"
import { ensureMonitoredBroadcasters } from "../../features/eventsub/monitoring"
import {
  buildFollowedChannelsView,
  type FollowedChannelViewItem,
} from "../../features/channels/followed-channels-view"
import {
  getAllFollowedChannels,
  getUsersByIds,
  type TwitchFollowedChannel,
} from "./users"
import {
  getAllFollowedStreams,
  resolveThumbnailUrl,
  type TwitchFollowedStream,
} from "./streams"
import { preserveCategoryStartedAt } from "../../db/repositories/channel-state"
import { getValidAccessToken } from "./token-refresh"

// Refresh every user's follow list daily even when they don't open the app:
// it drives which broadcasters global preferences monitor (ADR 0007) and the
// channel_state the channels list reads from D1.
const FOLLOW_SYNC_STALE_MS = 24 * 60 * 60 * 1000

// Each sync is several paginated Twitch calls plus monitoring maintenance;
// keep a run's subrequest usage bounded and let later runs take the rest.
const MAX_FOLLOW_SYNCS_PER_RUN = 3

export interface FollowedChannelsSyncFetch {
  channels: TwitchFollowedChannel[]
  streamByBroadcasterId: Map<string, TwitchFollowedStream>
  profileImageByBroadcasterId: Map<string, string>
  payload: FollowedChannelViewItem[]
}

/**
 * Get Followed Channels has no profile image, so avatars come from D1 and,
 * for follows with none stored yet, from Get Users; stored ones are left to
 * the monthly `refreshBroadcasterAvatars`, keeping sync cheap (issue #34). A failed lookup only
 * costs avatars (letter fallback, retried next sync), never the sync.
 */
async function resolveProfileImages(
  config: AppConfig,
  accessToken: string,
  channels: TwitchFollowedChannel[],
  stored: Map<string, string>,
  userId: string,
): Promise<Map<string, string>> {
  const missing = channels
    .map((ch) => ch.broadcaster_id)
    .filter((id) => !stored.has(id))
  if (missing.length === 0) return stored

  const resolved = new Map(stored)
  try {
    const users = await getUsersByIds(
      config.twitchClientId,
      accessToken,
      missing,
      config.twitchApiBaseUrl,
    )
    for (const user of users) {
      if (user.profile_image_url) resolved.set(user.id, user.profile_image_url)
    }
  } catch (error) {
    logger.warn("Broadcaster avatar lookup failed", {
      userId,
      missingCount: missing.length,
      ...serializeError(error),
    })
  }
  return resolved
}

/**
 * Twitch side of a follow sync: the paginated follows/streams fetch plus the
 * avatar lookup, shaped into the same response payload `GET
 * /channels/followed` returns (issue #83). Its only D1 access is a read of
 * stored avatars, run alongside the Twitch fetch, so callers can still
 * respond with `payload` before persisting anything.
 */
export async function fetchFollowedChannelsSync(
  db: Database,
  config: AppConfig,
  userId: string,
  twitchUserId: string,
  accessToken: string,
): Promise<FollowedChannelsSyncFetch> {
  const [channels, streams, storedProfileImages, storedStates] =
    await Promise.all([
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
      db.followedChannels.findProfileImageUrlsByUserId(userId),
      // Stored state feeds the category_started_at preserve rule so the
      // response matches what the deferred upsert will persist (issue #120).
      db.followedChannels
        .findByUserId(userId)
        .then((followed) =>
          db.channelState.findByBroadcasterUserIds(
            followed.map((ch) => ch.broadcaster_user_id),
          ),
        ),
    ])
  const storedStateById = new Map(
    storedStates.map((state) => [state.broadcaster_user_id, state]),
  )

  const profileImageByBroadcasterId = await resolveProfileImages(
    config,
    accessToken,
    channels,
    storedProfileImages,
    userId,
  )

  const streamByBroadcasterId = new Map(streams.map((s) => [s.user_id, s]))

  const payload = buildFollowedChannelsView(
    channels.map((ch) => ({
      broadcaster_user_id: ch.broadcaster_id,
      broadcaster_login: ch.broadcaster_login,
      broadcaster_display_name: ch.broadcaster_name,
      broadcaster_profile_image_url:
        profileImageByBroadcasterId.get(ch.broadcaster_id) ?? null,
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
                category_started_at: preserveCategoryStartedAt(
                  storedStateById.get(ch.broadcaster_id),
                  {
                    streamId: stream.id,
                    categoryId: stream.game_id || null,
                  },
                ),
                last_live_at: null,
                last_category_id: null,
                last_category_name: null,
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
                category_started_at: null,
                last_live_at: null,
                last_category_id: null,
                last_category_name: null,
              },
        ]
      }),
    ),
  )

  return {
    channels,
    streamByBroadcasterId,
    profileImageByBroadcasterId,
    payload,
  }
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
  fetched: Omit<FollowedChannelsSyncFetch, "payload">,
  now: string,
): Promise<void> {
  const { channels, streamByBroadcasterId, profileImageByBroadcasterId } =
    fetched
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
        broadcasterProfileImageUrl:
          profileImageByBroadcasterId.get(ch.broadcaster_id) ?? null,
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
      { preserveCategoryStartedAt: true },
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
  const fetched = await fetchFollowedChannelsSync(
    db,
    config,
    userId,
    twitchUserId,
    accessToken,
  )
  await persistFollowedChannelsSync(db, config, userId, fetched, now)
  return fetched.payload
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
    await persistFollowedChannelsSync(db, config, userId, fetched, now)
  } catch (error) {
    logger.error("Deferred follow sync write failed", {
      userId,
      channelCount: fetched.channels.length,
      ...serializeError(error),
    })
  }
}

/**
 * Scheduled refinement of follow sync (ADR 0036): re-syncs follows for any
 * user whose last sync is stale, oldest (never-synced) first, up to the
 * per-run cap. Users in reconnect state are skipped until they come back.
 */
export async function syncStaleFollows(
  db: Database,
  config: AppConfig,
): Promise<void> {
  const logFields = scheduledJobLogFields("follow-sync")
  try {
    const cutoff = new Date(Date.now() - FOLLOW_SYNC_STALE_MS).toISOString()
    const candidates = await db.users.listFollowSyncCandidates(
      cutoff,
      MAX_FOLLOW_SYNCS_PER_RUN,
    )
    let succeeded = 0

    for (const user of candidates) {
      try {
        const accessToken = await getValidAccessToken(db, config, user.id)
        await syncFollowedChannels(
          db,
          config,
          user.id,
          user.twitch_user_id,
          accessToken,
        )
        succeeded += 1
      } catch (error) {
        logger.error("Scheduled follow sync failed", {
          ...logFields,
          userId: user.id,
          ...serializeError(error),
        })
      }
    }

    logger.info("Scheduled follow sync run completed", {
      ...logFields,
      attempted: candidates.length,
      succeeded,
      failed: candidates.length - succeeded,
    })
  } catch (error) {
    // Covers a D1 read failure (listFollowSyncCandidates) or anything else
    // thrown outside the per-user handling above, so it's logged with full
    // detail instead of escaping as Cloudflare's bare automatic exception
    // capture.
    logger.error("Scheduled follow sync run failed", {
      ...logFields,
      ...serializeError(error),
    })
  }
}
