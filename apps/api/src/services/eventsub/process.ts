import type { AppConfig } from "../../env"
import type { Database } from "../../db"
import type { ChannelStateRecord } from "../../db/repositories/channel-state"
import type {
  ChannelUpdateEventPayload,
  StreamOfflineEventPayload,
  StreamOnlineEventPayload,
  TwitchEventQueueMessage,
} from "../../types"
import { getAppAccessToken } from "../twitch/app-token"
import { getStreamsByUserIds } from "../twitch/client"

// Twitch sends "" for an unset category; store it as null.
function normalizeCategory(value: string | null | undefined): string | null {
  return value || null
}

// Out-of-order guard (ADR 0033): skip a message when the state row was
// already written from a later EventSub message. Equal timestamps process —
// exact duplicates are caught by the message-id check instead.
function isStale(
  previous: ChannelStateRecord | null,
  messageTimestamp: string,
): boolean {
  if (!previous?.updated_from_event_at) return false
  return (
    Date.parse(previous.updated_from_event_at) > Date.parse(messageTimestamp)
  )
}

/**
 * Applies one EventSub notification to `channel_state` and records relevant
 * transitions in `channel_state_changes` (ADRs 0006, 0033). Idempotent per
 * EventSub message id: a message that already produced a change row is
 * skipped, and change inserts no-op on a duplicate message id. State is
 * written before the change row so `channel_state` stays the source of truth
 * even if the change insert is lost to a crash.
 */
export async function processTwitchEventMessage(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  message: TwitchEventQueueMessage,
): Promise<void> {
  const alreadyProcessed =
    await db.channelStateChanges.existsByEventsubMessageId(message.messageId)
  if (alreadyProcessed) return

  switch (message.eventType) {
    case "stream.online":
      return processStreamOnline(db, config, kv, message.event, message)
    case "stream.offline":
      return processStreamOffline(db, message.event, message)
    case "channel.update":
      return processChannelUpdate(db, message.event, message)
  }
}

async function processStreamOnline(
  db: Database,
  config: AppConfig,
  kv: KVNamespace,
  event: StreamOnlineEventPayload,
  message: TwitchEventQueueMessage,
): Promise<void> {
  const previous = await db.channelState.findByBroadcasterUserId(
    event.broadcaster_user_id,
  )
  if (isStale(previous, message.messageTimestamp)) return

  // The stream.online payload carries no category — fetch the live stream
  // for matching data. When Get Streams lags behind the event, fall back to
  // the last known channel info (channel.update keeps it current offline).
  const appAccessToken = await getAppAccessToken(kv, config)
  const streams = await getStreamsByUserIds(
    config.twitchClientId,
    appAccessToken,
    [event.broadcaster_user_id],
    config.twitchApiBaseUrl,
  )
  const stream = streams.find((s) => s.id === event.id) ?? streams[0]

  const next = {
    isLive: true,
    streamId: stream?.id ?? event.id,
    categoryId: normalizeCategory(stream?.game_id ?? previous?.category_id),
    categoryName: normalizeCategory(
      stream?.game_name ?? previous?.category_name,
    ),
    title: stream?.title || previous?.title || null,
    viewerCount: stream?.viewer_count ?? null,
    startedAt: stream?.started_at ?? event.started_at,
  }

  const now = new Date().toISOString()
  await db.channelState.upsertAll([
    {
      broadcasterUserId: event.broadcaster_user_id,
      ...next,
      updatedFromEventAt: message.messageTimestamp,
      now,
    },
  ])

  // A stream we already know as live (e.g. seeded at preference creation) is
  // not a transition — recording it would violate ADR 0008's future-only rule.
  const isNewStream = !previous?.is_live || previous.stream_id !== next.streamId
  if (!isNewStream) return

  await db.channelStateChanges.insertIfNew({
    broadcasterUserId: event.broadcaster_user_id,
    eventsubMessageId: message.messageId,
    changeType: "stream_started",
    previousIsLive: previous ? previous.is_live : null,
    nextIsLive: true,
    previousCategoryId: previous?.category_id ?? null,
    previousCategoryName: previous?.category_name ?? null,
    nextCategoryId: next.categoryId,
    nextCategoryName: next.categoryName,
    streamId: next.streamId,
    occurredAt: message.messageTimestamp,
    now,
  })
}

async function processStreamOffline(
  db: Database,
  event: StreamOfflineEventPayload,
  message: TwitchEventQueueMessage,
): Promise<void> {
  const previous = await db.channelState.findByBroadcasterUserId(
    event.broadcaster_user_id,
  )
  if (isStale(previous, message.messageTimestamp)) return

  // Category/title persist — they are channel info, not stream info.
  const now = new Date().toISOString()
  await db.channelState.upsertAll([
    {
      broadcasterUserId: event.broadcaster_user_id,
      isLive: false,
      streamId: null,
      categoryId: previous?.category_id ?? null,
      categoryName: previous?.category_name ?? null,
      title: previous?.title ?? null,
      viewerCount: null,
      startedAt: null,
      updatedFromEventAt: message.messageTimestamp,
      now,
    },
  ])

  if (!previous?.is_live) return

  await db.channelStateChanges.insertIfNew({
    broadcasterUserId: event.broadcaster_user_id,
    eventsubMessageId: message.messageId,
    changeType: "stream_ended",
    previousIsLive: true,
    nextIsLive: false,
    previousCategoryId: previous.category_id,
    previousCategoryName: previous.category_name,
    nextCategoryId: previous.category_id,
    nextCategoryName: previous.category_name,
    streamId: previous.stream_id,
    occurredAt: message.messageTimestamp,
    now,
  })
}

async function processChannelUpdate(
  db: Database,
  event: ChannelUpdateEventPayload,
  message: TwitchEventQueueMessage,
): Promise<void> {
  const previous = await db.channelState.findByBroadcasterUserId(
    event.broadcaster_user_id,
  )
  if (isStale(previous, message.messageTimestamp)) return

  const wasLive = previous?.is_live ?? false
  const nextCategoryId = normalizeCategory(event.category_id)
  const nextCategoryName = normalizeCategory(event.category_name)

  // Channel info updates apply live or offline so channel_state stays the
  // current snapshot; only the live category change is a relevant transition.
  const now = new Date().toISOString()
  await db.channelState.upsertAll([
    {
      broadcasterUserId: event.broadcaster_user_id,
      isLive: wasLive,
      streamId: previous?.stream_id ?? null,
      categoryId: nextCategoryId,
      categoryName: nextCategoryName,
      title: event.title || null,
      viewerCount: previous?.viewer_count ?? null,
      startedAt: previous?.started_at ?? null,
      updatedFromEventAt: message.messageTimestamp,
      now,
    },
  ])

  const previousCategoryId = previous?.category_id ?? null
  if (!wasLive || previousCategoryId === nextCategoryId) return

  await db.channelStateChanges.insertIfNew({
    broadcasterUserId: event.broadcaster_user_id,
    eventsubMessageId: message.messageId,
    changeType: "category_changed",
    previousIsLive: true,
    nextIsLive: true,
    previousCategoryId,
    previousCategoryName: previous?.category_name ?? null,
    nextCategoryId,
    nextCategoryName,
    streamId: previous?.stream_id ?? null,
    occurredAt: message.messageTimestamp,
    now,
  })
}
