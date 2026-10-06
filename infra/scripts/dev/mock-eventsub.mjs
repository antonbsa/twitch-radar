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
// Always seeds the broadcaster live in a baseline category, then sends a
// channel.update switching into the target category — the
// "switched_into_category" trigger (ADR 0008). Unlike stream.online, this path
// makes no real Twitch API call, so it matches deterministically.
//
// Usage:
//   node infra/scripts/dev/mock-eventsub.mjs
//   node infra/scripts/dev/mock-eventsub.mjs <broadcasterUserId> <categoryId> <categoryName> [baselineCategoryId] [baselineCategoryName]
//
// With no arguments, the target is derived from this worktree's local D1: the
// most recently logged-in user's oldest active channel preference, else their
// oldest active global preference paired with their first-followed monitored
// channel. Set MOCK_USER_ID (env or .env.local) to pick the user explicitly.

import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { loadDevEnv, REPO_ROOT } from "./load-env.mjs"

const USAGE =
  "Usage: node infra/scripts/dev/mock-eventsub.mjs [<broadcasterUserId> <categoryId> <categoryName> [baselineCategoryId] [baselineCategoryName]]"

// Must differ from any real category a preference could target, or the
// channel.update wouldn't be a category switch.
const DEFAULT_BASELINE = { id: "0", name: "Mock Baseline" }

// Test seam's fixed identity (apps/api/src/http/test-seam/shared.ts), left in
// the shared dev D1 by the e2e tier — never the user you're testing as.
const E2E_USER_ID = "usr_e2e"

// Same merged env the running `npm run dev` worker was started with.
const { vars, publicUrl } = loadDevEnv()
const webhookSecret = vars.EVENTSUB_WEBHOOK_SECRET
if (!webhookSecret) {
  throw new Error(
    "EVENTSUB_WEBHOOK_SECRET not found in .env.development/.env.local",
  )
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

// Read-only SELECTs against this worktree's local dev D1 — the same database
// its `npm run dev` worker uses.
function queryLocalD1(sql) {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "twitch-radar-dev",
      "--local",
      "--json",
      "--command",
      sql,
    ],
    { cwd: resolve(REPO_ROOT, "apps/api"), encoding: "utf-8" },
  )
  if (result.status !== 0) {
    throw new Error(
      `wrangler d1 execute failed:\n${result.stderr || result.stdout}`,
    )
  }
  return JSON.parse(result.stdout)[0].results
}

function findUser() {
  const forcedUserId = process.env.MOCK_USER_ID ?? vars.MOCK_USER_ID
  if (forcedUserId) {
    const [user] = queryLocalD1(
      `SELECT id, twitch_login FROM users WHERE id = ${sqlString(forcedUserId)}`,
    )
    if (!user) throw new Error(`MOCK_USER_ID ${forcedUserId} not found`)
    return user
  }
  // Sessions live in KV, not D1; twitch_tokens.updated_at is bumped on every
  // login (and token refresh), so it's the closest D1 proxy for "most recent
  // session".
  const [user] = queryLocalD1(
    `SELECT u.id, u.twitch_login FROM users u
     LEFT JOIN twitch_tokens t ON t.user_id = u.id
     WHERE u.id != ${sqlString(E2E_USER_ID)}
     ORDER BY COALESCE(t.updated_at, u.updated_at) DESC
     LIMIT 1`,
  )
  if (!user) {
    throw new Error(
      "No user in local D1 — log in through `npm run dev` first, or pass explicit arguments.",
    )
  }
  return user
}

function findTarget(userId) {
  const [channelPreference] = queryLocalD1(
    `SELECT broadcaster_user_id, category_id, category_name
     FROM channel_category_preferences
     WHERE user_id = ${sqlString(userId)} AND disabled_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  )
  if (channelPreference) {
    return {
      broadcasterUserId: channelPreference.broadcaster_user_id,
      categoryId: channelPreference.category_id,
      categoryName: channelPreference.category_name,
    }
  }

  const [globalPreference] = queryLocalD1(
    `SELECT category_id, category_name
     FROM global_category_preferences
     WHERE user_id = ${sqlString(userId)} AND disabled_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  )
  if (!globalPreference) {
    throw new Error(
      `User ${userId} has no active channel or global preference — add one in the app first.`,
    )
  }

  // Only monitored channels have EventSub subscriptions, so a global
  // preference can only fire for one of those.
  const [channel] = queryLocalD1(
    `SELECT f.broadcaster_user_id
     FROM followed_channels f
     JOIN monitored_channels m ON m.broadcaster_user_id = f.broadcaster_user_id
     WHERE f.user_id = ${sqlString(userId)} AND m.disabled_at IS NULL
     ORDER BY f.followed_at IS NULL, f.followed_at ASC
     LIMIT 1`,
  )
  if (!channel) {
    throw new Error(
      `User ${userId} has a global preference but no followed channel that is monitored.`,
    )
  }
  return {
    broadcasterUserId: channel.broadcaster_user_id,
    categoryId: globalPreference.category_id,
    categoryName: globalPreference.category_name,
  }
}

function resolveTarget(args) {
  const [
    broadcasterUserId,
    categoryId,
    categoryName,
    baselineCategoryId,
    baselineCategoryName,
  ] = args

  if (args.length > 0 && (!broadcasterUserId || !categoryId || !categoryName)) {
    console.error(USAGE)
    process.exit(1)
  }

  const baseline = baselineCategoryId
    ? {
        id: baselineCategoryId,
        name: baselineCategoryName ?? baselineCategoryId,
      }
    : DEFAULT_BASELINE

  if (args.length > 0) {
    return { broadcasterUserId, categoryId, categoryName, baseline }
  }

  const user = findUser()
  const target = findTarget(user.id)
  console.log(`Using user ${user.twitch_login} (${user.id}).`)
  return { ...target, baseline }
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

async function sendChannelUpdateWebhook(event) {
  const messageId = randomUUID()
  const timestamp = new Date().toISOString()
  const body = JSON.stringify({
    subscription: {
      id: "mock_sub",
      type: "channel.update",
      version: "2",
      status: "enabled",
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
      "Twitch-Eventsub-Subscription-Type": "channel.update",
    },
    body,
  })
}

async function inspect(broadcasterUserId) {
  const res = await fetch(`${publicUrl}/api/__test__/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ broadcasterUserIds: [broadcasterUserId] }),
  })
  return res.json()
}

// Filters by this run's stream id so deliveries left over from earlier runs
// against the same broadcaster don't count.
async function waitForDeliveries(
  broadcasterUserId,
  streamId,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const state = await inspect(broadcasterUserId)
    const deliveries = (state.notificationDeliveries ?? []).filter(
      (delivery) => delivery.stream_id === streamId,
    )
    if (deliveries.length > 0 || Date.now() > deadline) return deliveries
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function main() {
  const { broadcasterUserId, categoryId, categoryName, baseline } =
    resolveTarget(process.argv.slice(2))
  const streamId = `mock_${Date.now()}`

  console.log(
    `Seeding ${broadcasterUserId} live in ${baseline.name} (${baseline.id})...`,
  )
  await seed({
    channelState: [
      {
        broadcasterUserId,
        isLive: true,
        streamId,
        categoryId: baseline.id,
        categoryName: baseline.name,
      },
    ],
  })

  console.log(`Sending channel.update -> ${categoryName} (${categoryId})...`)
  const res = await sendChannelUpdateWebhook({
    broadcaster_user_id: broadcasterUserId,
    broadcaster_user_login: "mock_broadcaster",
    broadcaster_user_name: "Mock Broadcaster",
    title: "Manual test stream",
    language: "en",
    category_id: categoryId,
    category_name: categoryName,
    content_classification_labels: [],
  })
  console.log(`Webhook responded ${res.status}`)

  console.log("Waiting for a notification_deliveries row...")
  const deliveries = await waitForDeliveries(broadcasterUserId, streamId)
  if (deliveries.length === 0) {
    console.log(
      "No delivery row appeared — either no active preference matches this broadcaster+category, or matching hasn't finished yet. Check the `npm run dev` api console for consumer logs.",
    )
    return
  }
  for (const delivery of deliveries) {
    console.log(delivery)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
