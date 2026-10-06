import { scheduledJobLogFields } from "../../crons"
import type { Database } from "../../db"
import type { AppConfig } from "../../env"
import { logger, serializeError } from "../../lib/logger"
import { getAppAccessToken } from "./app-token"
import { getUsersByIds } from "./users"

/**
 * The monthly refresh rides the hourly follow-sync trigger (no free cron slot,
 * ADR 0048) and runs only in the 04:xx UTC hour of the 1st.
 *
 * @param scheduledTime Epoch ms, from `ScheduledController.scheduledTime`.
 */
export function isAvatarRefreshSlot(scheduledTime: number): boolean {
  const date = new Date(scheduledTime)
  return date.getUTCDate() === 1 && date.getUTCHours() === 4
}

/**
 * Re-fetches every followed broadcaster's avatar (issue #25): the follow sync
 * only looks up avatars for new follows, so this keeps stored ones from going
 * stale. Broadcasters Twitch no longer returns keep their stored avatar.
 */
export async function refreshBroadcasterAvatars(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
): Promise<void> {
  const logFields = scheduledJobLogFields("avatar-refresh")
  try {
    const broadcasterUserIds =
      await db.followedChannels.listDistinctBroadcasterUserIds()
    if (broadcasterUserIds.length === 0) {
      logger.info("Broadcaster avatar refresh found nothing to do", logFields)
      return
    }

    const accessToken = await getAppAccessToken(kv, config)
    const users = await getUsersByIds(
      config.twitchClientId,
      accessToken,
      broadcasterUserIds,
      config.twitchApiBaseUrl,
    )
    const updates = users
      .filter((user) => user.profile_image_url)
      .map((user) => ({
        broadcasterUserId: user.id,
        profileImageUrl: user.profile_image_url,
      }))
    await db.followedChannels.updateProfileImageUrls(updates)

    logger.info("Broadcaster avatar refresh completed", {
      ...logFields,
      broadcasters: broadcasterUserIds.length,
      updated: updates.length,
    })
  } catch (error) {
    logger.error("Broadcaster avatar refresh failed", {
      ...logFields,
      ...serializeError(error),
    })
  }
}
