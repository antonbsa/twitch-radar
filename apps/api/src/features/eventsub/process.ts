import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import type { ChannelStateChangeRecord } from "../../db/repositories/channel-state-changes"
import { applyEvent } from "../channel-state/service"
import type { StreamReading } from "../channel-state/transition"
import type { StreamOnlineEventPayload, TwitchEventQueueMessage } from "./types"
import { getAppAccessToken } from "../../services/twitch/app-token"
import { getStreamsByUserIds } from "../../services/twitch/streams"

/**
 * The stream.online payload carries no category, so the live stream is fetched
 * for matching data. Undefined when Get Streams lags behind the event; the
 * Channel State module then falls back to the last known channel info.
 */
async function fetchLiveStream(
  config: AppConfig,
  kv: KVNamespace,
  event: StreamOnlineEventPayload,
): Promise<StreamReading | undefined> {
  const appAccessToken = await getAppAccessToken(kv, config)
  const streams = await getStreamsByUserIds(
    config.twitchClientId,
    appAccessToken,
    [event.broadcaster_user_id],
    config.twitchApiBaseUrl,
  )
  return streams.find((s) => s.id === event.id) ?? streams[0]
}

/**
 * Applies one EventSub notification to Channel State (ADRs 0006, 0033, 0034).
 * Returns the State Change this message maps to, fresh or pre-existing, so the
 * caller can run notification matching on it.
 *
 * @returns `null` when the message was stale or produced no tracked transition.
 */
export async function processTwitchEventMessage(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  message: TwitchEventQueueMessage,
): Promise<ChannelStateChangeRecord | null> {
  const stream =
    message.eventType === "stream.online"
      ? await fetchLiveStream(config, kv, message.event)
      : undefined
  return applyEvent(db, message, stream)
}
