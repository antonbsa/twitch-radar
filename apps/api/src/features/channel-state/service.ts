import type { Database } from "../../db"
import type {
  ChannelStateRecord,
  UpsertChannelStateInput,
} from "../../db/repositories/channel-state"
import type { ChannelStateChangeRecord } from "../../db/repositories/channel-state-changes"
import { logger } from "../../lib/logger"
import type { TwitchEventQueueMessage } from "../eventsub/types"
import {
  describeChange,
  isStaleEvent,
  transition,
  type StreamReading,
} from "./transition"

export interface SnapshotResult {
  /** One per id, in input order. */
  states: ChannelStateRecord[]
  /** Persists `states`. Separate so a caller can respond before writing (issue #83). */
  commit: () => Promise<void>
}

function toUpsertInput(state: ChannelStateRecord): UpsertChannelStateInput {
  return {
    broadcasterUserId: state.broadcaster_user_id,
    isLive: state.is_live,
    streamId: state.stream_id,
    categoryId: state.category_id,
    categoryName: state.category_name,
    title: state.title,
    thumbnailUrl: state.thumbnail_url,
    viewerCount: state.viewer_count,
    startedAt: state.started_at,
    categoryStartedAt: state.category_started_at,
    streamType: state.stream_type,
    lastLiveAt: state.last_live_at,
    lastCategoryId: state.last_category_id,
    lastCategoryName: state.last_category_name,
    updatedFromEventAt: state.updated_from_event_at,
    now: state.updated_at,
  }
}

/**
 * Applies a poll of Twitch (follow sync, monitoring seed) to Channel State.
 * Ids absent from `streams` are offline. The read-then-write race with a
 * concurrent Event is accepted.
 */
export async function applySnapshot(
  db: Database,
  broadcasterIds: string[],
  streams: StreamReading[],
  now: string,
): Promise<SnapshotResult> {
  const previousById = new Map(
    (await db.channelState.findByBroadcasterUserIds(broadcasterIds)).map(
      (state) => [state.broadcaster_user_id, state],
    ),
  )
  const streamById = new Map(streams.map((s) => [s.user_id, s]))
  const states = broadcasterIds.map((broadcasterId) =>
    transition(
      previousById.get(broadcasterId) ?? null,
      {
        kind: "snapshot",
        broadcasterId,
        stream: streamById.get(broadcasterId) ?? null,
      },
      now,
    ),
  )
  return {
    states,
    commit: () => db.channelState.upsertAll(states.map(toUpsertInput)),
  }
}

/**
 * Applies one EventSub Event (ADRs 0006, 0033). Idempotent per message id: a
 * redelivery writes nothing and returns the State Change it already produced,
 * so notification matching can recover from a crash (ADR 0034). The state is
 * written before the State Change, so a lost insert never leaves Channel State
 * behind. Makes no Twitch call: the caller passes the live `stream` for
 * `stream.online`.
 *
 * @returns `null` for a Stale Event or one that produced no State Change.
 */
export async function applyEvent(
  db: Database,
  message: TwitchEventQueueMessage,
  stream?: StreamReading,
): Promise<ChannelStateChangeRecord | null> {
  const existing = await db.channelStateChanges.findByEventsubMessageId(
    message.messageId,
  )
  if (existing) {
    logger.debug("Skipping already-processed EventSub message", {
      messageId: message.messageId,
      changeType: existing.change_type,
    })
    return existing
  }

  const previous = await db.channelState.findByBroadcasterUserId(
    message.event.broadcaster_user_id,
  )
  if (isStaleEvent(previous, message.messageTimestamp)) return null

  const now = new Date().toISOString()
  const next = transition(previous, { kind: "event", message, stream }, now)
  await db.channelState.upsertAll([toUpsertInput(next)])

  const change = describeChange(previous, next, message, now)
  return change ? db.channelStateChanges.insertIfNew(change) : null
}
