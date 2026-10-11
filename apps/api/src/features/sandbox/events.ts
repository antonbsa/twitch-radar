import { nanoid } from "nanoid"
import { z } from "zod"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { ApiError } from "../../http/errors"
import { parseBody } from "../../http/handlers"
import { jsonResponse } from "../../http/response"
import { applyTwitchEvent } from "../../queues/twitch-events"
import type { TwitchEventQueueMessage } from "../eventsub/types"
import { CATEGORIES, getPersonaFixture, PERSONAS } from "./personas"

const EventSchema = z.object({
  type: z.enum(["go_live", "switch_category"]),
  broadcasterUserId: z.string().min(1),
  categoryId: z.string().min(1),
})

/**
 * `POST /api/__sandbox__/events`: forges the `stream.online` or `channel.update`
 * notification a followed sandbox channel would send and runs it through the
 * same processing and matching as the real webhook, skipping only HMAC
 * verification (ADR 0046). Restricted to the caller's own persona follows, so
 * it can never touch a real user's or broadcaster's state.
 */
export async function handleSandboxEvent(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { db, config, userId } = c.var
  const input = await parseBody(c, EventSchema, "Invalid sandbox event")

  const persona = PERSONAS.find(
    (name) => getPersonaFixture(name).user.id === userId,
  )
  const category = CATEGORIES.find((cat) => cat.id === input.categoryId)
  if (!persona) {
    throw new ApiError(403, "forbidden", "Sandbox events need a persona login")
  }
  if (!category) {
    throw new ApiError(400, "invalid_request", "Unknown sandbox category")
  }

  const followed = await db.followedChannels.findOne(
    userId,
    input.broadcasterUserId,
  )
  if (!followed) {
    throw new ApiError(404, "not_found", "Channel is not followed")
  }

  const previous = await db.channelState.findByBroadcasterUserId(
    followed.broadcaster_user_id,
  )
  const now = new Date().toISOString()
  const messageId = `sbx_msg_${nanoid()}`
  const broadcaster = {
    broadcaster_user_id: followed.broadcaster_user_id,
    broadcaster_user_login: followed.broadcaster_login,
    broadcaster_user_name: followed.broadcaster_display_name,
  }
  const envelope = {
    messageId,
    messageTimestamp: now,
    receivedAt: now,
  }

  let message: TwitchEventQueueMessage
  if (input.type === "go_live") {
    // stream.online carries no category and the real handler reads it from
    // Get Streams, which has nothing for a channel that is offline. Park the
    // channel offline in the target category first so the handler's fallback
    // to the last known category yields it.
    await db.channelState.upsertAll([
      {
        broadcasterUserId: followed.broadcaster_user_id,
        isLive: false,
        streamId: null,
        categoryId: category.id,
        categoryName: category.name,
        title: previous?.title ?? null,
        thumbnailUrl: previous?.thumbnail_url ?? null,
        now,
      },
    ])
    message = {
      ...envelope,
      eventType: "stream.online",
      event: {
        ...broadcaster,
        id: `sbx_stream_${nanoid()}`,
        type: "live",
        started_at: now,
      },
    }
  } else {
    if (!previous?.is_live) {
      throw new ApiError(409, "channel_not_live", "Channel is not live")
    }
    message = {
      ...envelope,
      eventType: "channel.update",
      event: {
        ...broadcaster,
        title: previous.title ?? "",
        language: "en",
        category_id: category.id,
        category_name: category.name,
        content_classification_labels: [],
      },
    }
  }

  // Notification text names the channel from monitored_channels, like a real
  // preference would have created it.
  await db.monitoredChannels.upsertAll([
    {
      broadcasterUserId: followed.broadcaster_user_id,
      broadcasterLogin: followed.broadcaster_login,
      broadcasterDisplayName: followed.broadcaster_display_name,
      monitorReason: "channel_preference",
      now,
    },
  ])

  const change = await applyTwitchEvent(db, config, c.env, message)
  const deliveries = await db.notificationDeliveries.findByBroadcasterUserIds([
    followed.broadcaster_user_id,
  ])
  const notified = deliveries.some(
    (delivery) =>
      delivery.eventsub_message_id === messageId && delivery.user_id === userId,
  )

  return jsonResponse({
    data: { change_type: change?.change_type ?? null, notified },
  })
}
