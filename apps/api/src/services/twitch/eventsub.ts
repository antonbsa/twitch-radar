import { TwitchApiError, readErrorBody } from "./errors"

export interface CreateEventsubSubscriptionInput {
  type: string
  version: string
  broadcasterUserId: string
  callbackUrl: string
  secret: string
}

export interface TwitchEventsubSubscription {
  id: string
  status: string
  type: string
  version: string
}

export async function createEventsubSubscription(
  clientId: string,
  appAccessToken: string,
  input: CreateEventsubSubscriptionInput,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchEventsubSubscription> {
  const res = await fetch(`${apiBaseUrl}/helix/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${appAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: input.type,
      version: input.version,
      condition: { broadcaster_user_id: input.broadcasterUserId },
      transport: {
        method: "webhook",
        callback: input.callbackUrl,
        secret: input.secret,
      },
    }),
  })
  if (!res.ok)
    throw new TwitchApiError(
      `EventSub subscription create failed`,
      res.status,
      await readErrorBody(res),
    )
  const body = (await res.json()) as { data: TwitchEventsubSubscription[] }
  const subscription = body.data[0]
  if (!subscription)
    throw new TwitchApiError("No subscription in Twitch response", 200, "")
  return subscription
}

export interface TwitchEventsubSubscriptionDetails {
  id: string
  status: string
  type: string
  version: string
  condition: { broadcaster_user_id?: string }
  transport: { method: string; callback?: string }
}

export async function getAllEventsubSubscriptions(
  clientId: string,
  appAccessToken: string,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<TwitchEventsubSubscriptionDetails[]> {
  const results: TwitchEventsubSubscriptionDetails[] = []
  let cursor: string | undefined

  do {
    const url = new URL(`${apiBaseUrl}/helix/eventsub/subscriptions`)
    // The explicit page-size param also disambiguates this GET from the POST
    // create call for the test tier's substring-matching mock server.
    url.searchParams.set("first", "100")
    if (cursor) url.searchParams.set("after", cursor)

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${appAccessToken}`,
      },
    })
    if (!res.ok)
      throw new TwitchApiError(
        `EventSub subscription list failed`,
        res.status,
        await readErrorBody(res),
      )
    const body = (await res.json()) as {
      data: TwitchEventsubSubscriptionDetails[]
      pagination?: { cursor?: string }
    }
    results.push(...body.data)
    cursor = body.pagination?.cursor
  } while (cursor)

  return results
}

export async function deleteEventsubSubscription(
  clientId: string,
  appAccessToken: string,
  twitchSubscriptionId: string,
  apiBaseUrl = "https://api.twitch.tv",
): Promise<void> {
  const url = new URL(`${apiBaseUrl}/helix/eventsub/subscriptions`)
  url.searchParams.set("id", twitchSubscriptionId)

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${appAccessToken}`,
    },
  })
  // Already gone on Twitch's side is the desired end state, not a failure.
  if (!res.ok && res.status !== 404)
    throw new TwitchApiError(
      `EventSub subscription delete failed`,
      res.status,
      await readErrorBody(res),
    )
}
