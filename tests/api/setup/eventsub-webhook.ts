import { createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { API_TEST_URL } from "./ports"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")

// The worker under test boots with only .env.development (see
// global-setup.ts), so signatures must use that file's webhook secret —
// read it from the file itself so the two can't drift.
function readDevWebhookSecret(): string {
  const env = readFileSync(resolve(REPO_ROOT, ".env.development"), "utf8")
  const match = env.match(/^EVENTSUB_WEBHOOK_SECRET=(.+)$/m)
  if (!match) {
    throw new Error("EVENTSUB_WEBHOOK_SECRET not found in .env.development")
  }
  return match[1].trim()
}

export const DEV_WEBHOOK_SECRET = readDevWebhookSecret()

export interface EventsubWebhookOptions {
  messageType?: "notification" | "webhook_callback_verification" | "revocation"
  messageId?: string
  timestamp?: string
  subscription?: Record<string, unknown>
  event?: Record<string, unknown>
  challenge?: string
  secret?: string
  signatureOverride?: string
}

/**
 * Sends a Twitch-EventSub-shaped webhook request signed the way Twitch signs
 * them: HMAC-SHA256 over messageId + timestamp + raw body.
 */
export async function sendEventsubWebhook(
  subscriptionType: string,
  options: EventsubWebhookOptions = {},
): Promise<Response> {
  const messageType = options.messageType ?? "notification"
  const messageId = options.messageId ?? randomUUID()
  const timestamp = options.timestamp ?? new Date().toISOString()
  const secret = options.secret ?? DEV_WEBHOOK_SECRET

  const body = JSON.stringify({
    subscription: {
      id: "twitch_sub_default",
      type: subscriptionType,
      version: "1",
      status: "enabled",
      ...options.subscription,
    },
    ...(messageType === "webhook_callback_verification"
      ? { challenge: options.challenge ?? "challenge-token" }
      : {}),
    ...(messageType === "notification" ? { event: options.event ?? {} } : {}),
  })

  const signature =
    options.signatureOverride ??
    `sha256=${createHmac("sha256", secret)
      .update(messageId + timestamp + body)
      .digest("hex")}`

  return fetch(`${API_TEST_URL}/api/webhooks/twitch/eventsub`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Twitch-Eventsub-Message-Id": messageId,
      "Twitch-Eventsub-Message-Type": messageType,
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": signature,
      "Twitch-Eventsub-Subscription-Type": subscriptionType,
    },
    body,
  })
}
