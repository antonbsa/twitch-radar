import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import { ensureMonitoredBroadcasters } from "../monitoring"
import { getAllFollowedChannels, getAllFollowedStreams } from "./client"

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
