import type { ChannelStateRecord } from "../../db/repositories/channel-state"
import type { InsertChannelStateChangeInput } from "../../db/repositories/channel-state-changes"
import {
  resolveThumbnailUrl,
  type TwitchStream,
} from "../../services/twitch/streams"
import type { TwitchEventQueueMessage } from "../eventsub/types"

/** What one Twitch poll or Get Streams call says about a live stream. */
export type StreamReading = Pick<
  TwitchStream,
  | "id"
  | "user_id"
  | "game_id"
  | "game_name"
  | "title"
  | "viewer_count"
  | "started_at"
  | "thumbnail_url"
> & { type?: string }

export type TransitionInput =
  | { kind: "snapshot"; broadcasterId: string; stream: StreamReading | null }
  | { kind: "event"; message: TwitchEventQueueMessage; stream?: StreamReading }

/** Twitch sends "" for an unset category; store it as null. */
function normalizeCategory(value: string | null | undefined): string | null {
  return value || null
}

/**
 * Out-of-order guard (ADR 0033): an Event is stale when the row was already
 * written from a later one. Equal timestamps process; exact duplicates are
 * caught by the message-id check instead.
 */
export function isStaleEvent(
  previous: ChannelStateRecord | null | undefined,
  messageTimestamp: string,
): boolean {
  if (!previous?.updated_from_event_at) return false
  return (
    Date.parse(previous.updated_from_event_at) > Date.parse(messageTimestamp)
  )
}

function blank(broadcasterId: string, now: string): ChannelStateRecord {
  return {
    broadcaster_user_id: broadcasterId,
    is_live: false,
    stream_id: null,
    category_id: null,
    category_name: null,
    title: null,
    thumbnail_url: null,
    viewer_count: null,
    started_at: null,
    category_started_at: null,
    stream_type: null,
    last_live_at: null,
    last_category_id: null,
    last_category_name: null,
    updated_from_event_at: null,
    updated_at: now,
  }
}

/**
 * The offline shape shared by a Snapshot of an absent stream and
 * `stream.offline`: category/title/thumbnail are channel info, not stream
 * info, so they carry over (ADR 0033). On a live→offline transition the row
 * being replaced supplies `last_*`; `lastLiveAt` is the moment it ended.
 */
function goOffline(
  previous: ChannelStateRecord,
  lastLiveAt: string,
): ChannelStateRecord {
  const wasLive = previous.is_live
  return {
    ...previous,
    is_live: false,
    stream_id: null,
    viewer_count: null,
    started_at: null,
    category_started_at: null,
    last_live_at: wasLive ? lastLiveAt : previous.last_live_at,
    last_category_id: wasLive
      ? previous.category_id
      : previous.last_category_id,
    last_category_name: wasLive
      ? previous.category_name
      : previous.last_category_name,
  }
}

/**
 * The next Channel State from the stored one and one input. The single source
 * of the field rules:
 * - `category_started_at` is exact or null (issue #120): a Snapshot keeps the
 *   stored value only for the same stream and category; a new stream starts in
 *   its first category; a live category change takes the Event time.
 * - A Snapshot never erases what only Events know: `stream_type`,
 *   `updated_from_event_at`, and an offline channel's category/title/thumbnail
 *   (ADR 0033).
 */
export function transition(
  previous: ChannelStateRecord | null,
  input: TransitionInput,
  now: string,
): ChannelStateRecord {
  if (input.kind === "snapshot") {
    const base = previous ?? blank(input.broadcasterId, now)
    const stream = input.stream
    if (!stream) return { ...goOffline(base, now), updated_at: now }

    const categoryId = stream.game_id || null
    const sameCategory =
      base.stream_id === stream.id && base.category_id === categoryId
    return {
      ...base,
      is_live: true,
      stream_id: stream.id,
      category_id: categoryId,
      category_name: stream.game_name || null,
      title: stream.title || null,
      thumbnail_url: resolveThumbnailUrl(stream.thumbnail_url),
      viewer_count: stream.viewer_count,
      started_at: stream.started_at,
      category_started_at: sameCategory ? base.category_started_at : null,
      updated_at: now,
    }
  }

  const { message, stream } = input
  const base = previous ?? blank(message.event.broadcaster_user_id, now)
  const eventAt = message.messageTimestamp
  let next: ChannelStateRecord

  switch (message.eventType) {
    case "stream.online": {
      const startedAt = stream?.started_at ?? message.event.started_at
      // Get Streams can lag behind the event; fall back to the last known
      // channel info, which channel.update keeps current while offline.
      next = {
        ...base,
        is_live: true,
        stream_id: stream?.id ?? message.event.id,
        category_id: normalizeCategory(stream?.game_id ?? base.category_id),
        category_name: normalizeCategory(
          stream?.game_name ?? base.category_name,
        ),
        title: stream?.title || base.title || null,
        thumbnail_url:
          resolveThumbnailUrl(stream?.thumbnail_url) ?? base.thumbnail_url,
        viewer_count: stream?.viewer_count ?? null,
        started_at: startedAt,
        category_started_at: startedAt,
        // ADR 0051: notification matching suppresses anything but "live".
        stream_type: stream?.type ?? message.event.type,
      }
      break
    }
    case "stream.offline":
      next = goOffline(base, eventAt)
      break
    case "channel.update": {
      const categoryId = normalizeCategory(message.event.category_id)
      next = {
        ...base,
        category_id: categoryId,
        category_name: normalizeCategory(message.event.category_name),
        title: message.event.title || null,
        category_started_at: !base.is_live
          ? null
          : base.category_id === categoryId
            ? base.category_started_at
            : eventAt,
      }
      break
    }
  }
  return { ...next, updated_from_event_at: eventAt, updated_at: now }
}

/**
 * The State Change an Event produced, or null when it moved nothing that
 * matters for notifications. A stream already known as live (e.g. seeded at
 * preference creation) is not a transition (ADR 0008).
 */
export function describeChange(
  previous: ChannelStateRecord | null,
  next: ChannelStateRecord,
  message: TwitchEventQueueMessage,
  now: string,
): InsertChannelStateChangeInput | null {
  const common = {
    broadcasterUserId: message.event.broadcaster_user_id,
    eventsubMessageId: message.messageId,
    occurredAt: message.messageTimestamp,
    now,
  }
  switch (message.eventType) {
    case "stream.online":
      if (previous?.is_live && previous.stream_id === next.stream_id) {
        return null
      }
      return {
        ...common,
        changeType: "stream_started",
        previousIsLive: previous ? previous.is_live : null,
        nextIsLive: true,
        previousCategoryId: previous?.category_id ?? null,
        previousCategoryName: previous?.category_name ?? null,
        nextCategoryId: next.category_id,
        nextCategoryName: next.category_name,
        streamId: next.stream_id,
      }
    case "stream.offline":
      if (!previous?.is_live) return null
      return {
        ...common,
        changeType: "stream_ended",
        previousIsLive: true,
        nextIsLive: false,
        previousCategoryId: previous.category_id,
        previousCategoryName: previous.category_name,
        nextCategoryId: previous.category_id,
        nextCategoryName: previous.category_name,
        streamId: previous.stream_id,
      }
    case "channel.update":
      if (!previous?.is_live || previous.category_id === next.category_id) {
        return null
      }
      return {
        ...common,
        changeType: "category_changed",
        previousIsLive: true,
        nextIsLive: true,
        previousCategoryId: previous.category_id,
        previousCategoryName: previous.category_name,
        nextCategoryId: next.category_id,
        nextCategoryName: next.category_name,
        streamId: previous.stream_id,
      }
  }
}
