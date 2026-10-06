import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { jsonResponse } from "../response"
import { readJsonBody } from "./shared"

export interface InspectRequestBody {
  broadcasterUserIds: string[]
  // When set, the response also carries this user's push subscriptions
  // (user-keyed, unlike everything else here).
  userId?: string
}

/**
 * Read-only window into broadcaster-keyed tables the public API never
 * exposes (monitoring is server-internal, ADR 0007) so tests can assert
 * monitored_channels / eventsub_subscriptions / channel_state /
 * notification_deliveries side effects.
 */
export async function handleTestInspect(
  c: Context<HonoEnv>,
): Promise<Response> {
  const body = await readJsonBody<InspectRequestBody>(c)
  const ids = body.broadcasterUserIds ?? []

  const [
    monitored,
    eventsub,
    state,
    stateChanges,
    deliveries,
    snoozes,
    pushSubs,
  ] = await Promise.all([
    c.var.db.monitoredChannels.findByBroadcasterUserIds(ids),
    c.var.db.eventsubSubscriptions.findByBroadcasterUserIds(ids),
    c.var.db.channelState.findByBroadcasterUserIds(ids),
    c.var.db.channelStateChanges.findByBroadcasterUserIds(ids),
    c.var.db.notificationDeliveries.findByBroadcasterUserIds(ids),
    c.var.db.notificationSnoozes.findByBroadcasterUserIds(ids),
    body.userId
      ? c.var.db.pushSubscriptions.listByUserId(body.userId)
      : Promise.resolve([]),
  ])

  return jsonResponse({
    monitoredChannels: monitored,
    eventsubSubscriptions: eventsub,
    channelState: state,
    channelStateChanges: stateChanges,
    notificationDeliveries: deliveries,
    notificationSnoozes: snoozes,
    pushSubscriptions: pushSubs,
  })
}
