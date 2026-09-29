#!/usr/bin/env node
// Dev-only tool: forges a signed Twitch EventSub webhook against your local
// `npm run dev` API worker so you can force a notification without waiting
// for a real broadcaster to go live. The webhook route only checks the HMAC
// signature (ADR 0032), not that Twitch itself sent the request, so a
// correctly-signed forged request is indistinguishable to the worker.
//
// Only works when the worker's ENVIRONMENT !== "production" (the test seam
// this script also calls is unregistered in production, see AGENTS.md).
//
// Usage:
//   node infra/scripts/dev/mock-eventsub.mjs <broadcasterUserId> <categoryId> <categoryName> [baselineCategoryId] [baselineCategoryName]
//
// Example — force a "switched into category" notification for a followed
// broadcaster (get their numeric id from a `GET /api/channels/followed`
// response or the network tab when creating a preference):
//   node infra/scripts/dev/mock-eventsub.mjs 123456789 509658 "Just Chatting" 27471 Minecraft
//
// With no baseline category args, sends `stream.online` instead (a
// "stream started in category" notification) after seeding the broadcaster
// offline.

import { createHmac, randomUUID } from "node:crypto"
import { loadDevEnv } from "./load-env.mjs"

const [
  broadcasterUserId,
  categoryId,
  categoryName,
  baselineCategoryId,
  baselineCategoryName,
] = process.argv.slice(2)

if (!broadcasterUserId || !categoryId || !categoryName) {
  console.error(
    "Usage: node infra/scripts/dev/mock-eventsub.mjs <broadcasterUserId> <categoryId> <categoryName> [baselineCategoryId] [baselineCategoryName]",
  )
  process.exit(1)
}

// Same merged env the running `npm run dev` worker was started with.
const { vars, publicUrl } = loadDevEnv()
const webhookSecret = vars.EVENTSUB_WEBHOOK_SECRET
if (!webhookSecret) {
  throw new Error(
    "EVENTSUB_WEBHOOK_SECRET not found in .env.development/.env.local",
  )
}

async function seed(body) {
  const res = await fetch(`${publicUrl}/api/__test__/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Seed failed: ${res.status} ${await res.text()}`)
  }
}

async function sendEventsubWebhook(
  subscriptionType,
  event,
  subscriptionOverrides = {},
) {
  const messageId = randomUUID()
  const timestamp = new Date().toISOString()
  const body = JSON.stringify({
    subscription: {
      id: "mock_sub",
      type: subscriptionType,
      version: subscriptionType === "channel.update" ? "2" : "1",
      status: "enabled",
      ...subscriptionOverrides,
    },
    event,
  })
  const signature = `sha256=${createHmac("sha256", webhookSecret)
    .update(messageId + timestamp + body)
    .digest("hex")}`

  return fetch(`${publicUrl}/api/webhooks/twitch/eventsub`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Twitch-Eventsub-Message-Id": messageId,
      "Twitch-Eventsub-Message-Type": "notification",
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": signature,
      "Twitch-Eventsub-Subscription-Type": subscriptionType,
    },
    body,
  })
}

async function inspect() {
  const res = await fetch(`${publicUrl}/api/__test__/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ broadcasterUserIds: [broadcasterUserId] }),
  })
  return res.json()
}

async function waitForDelivery(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const state = await inspect()
    if (state.notificationDeliveries?.length > 0) return state
    if (Date.now() > deadline) return state
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function main() {
  if (baselineCategoryId) {
    // Seed the broadcaster already live in a different category, then send a
    // channel.update switching into the target category — the
    // "switched_into_category" trigger (ADR 0008), no real Twitch API calls.
    console.log(
      `Seeding ${broadcasterUserId} live in ${baselineCategoryName} (${baselineCategoryId})...`,
    )
    await seed({
      channelState: [
        {
          broadcasterUserId,
          isLive: true,
          streamId: `mock_${Date.now()}`,
          categoryId: baselineCategoryId,
          categoryName: baselineCategoryName ?? baselineCategoryId,
        },
      ],
    })

    console.log(`Sending channel.update -> ${categoryName} (${categoryId})...`)
    const res = await sendEventsubWebhook(
      "channel.update",
      {
        broadcaster_user_id: broadcasterUserId,
        broadcaster_user_login: "mock_broadcaster",
        broadcaster_user_name: "Mock Broadcaster",
        title: "Manual test stream",
        language: "en",
        category_id: categoryId,
        category_name: categoryName,
        content_classification_labels: [],
      },
      { version: "2" },
    )
    console.log(`Webhook responded ${res.status}`)
  } else {
    // No baseline given: seed offline, then stream.online. Note this path
    // does call real Twitch (Get Streams with the app token) inside the
    // worker — if the broadcaster isn't genuinely live, category falls back
    // to the (null) seeded state and matching will find nothing. Prefer the
    // baseline-category form above for a guaranteed match.
    console.log(`Seeding ${broadcasterUserId} offline...`)
    await seed({ channelState: [{ broadcasterUserId, isLive: false }] })

    console.log(`Sending stream.online...`)
    const res = await sendEventsubWebhook("stream.online", {
      id: `mock_${Date.now()}`,
      broadcaster_user_id: broadcasterUserId,
      broadcaster_user_login: "mock_broadcaster",
      broadcaster_user_name: "Mock Broadcaster",
      type: "live",
      started_at: new Date().toISOString(),
    })
    console.log(`Webhook responded ${res.status}`)
  }

  console.log("Waiting for a notification_deliveries row...")
  const state = await waitForDelivery()
  if (!state.notificationDeliveries?.length) {
    console.log(
      "No delivery row appeared — either no active preference matches this broadcaster+category, or matching hasn't finished yet. Check the `npm run dev` api console for consumer logs.",
    )
    return
  }
  for (const delivery of state.notificationDeliveries) {
    console.log(delivery)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
