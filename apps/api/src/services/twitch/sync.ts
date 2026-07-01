import type { AppConfig } from "../../env"
import type { Database } from "../../db"
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
    getAllFollowedChannels(config.twitchClientId, accessToken, twitchUserId),
    getAllFollowedStreams(config.twitchClientId, accessToken, twitchUserId),
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

  await db.users.updateLastFollowSyncAt(userId, now, now)
}
