import { z } from "zod"
import type { Database } from "./db"
import type { NotificationJobMessage, TwitchEventQueueMessage } from "./types"

export interface Env {
  DB: D1Database
  APP_CACHE: KVNamespace
  TWITCH_EVENTS_QUEUE: Queue<TwitchEventQueueMessage>
  NOTIFICATION_JOBS_QUEUE: Queue<NotificationJobMessage>
  ENVIRONMENT?: string
  PUBLIC_BASE_URL: string
  TWITCH_CLIENT_ID: string
  TWITCH_REDIRECT_URI: string
  EVENTSUB_CALLBACK_URL: string
  VAPID_PUBLIC_KEY: string
  VAPID_SUBJECT: string
  TWITCH_CLIENT_SECRET: string
  EVENTSUB_WEBHOOK_SECRET: string
  TOKEN_ENCRYPTION_KEY: string
  VAPID_PRIVATE_KEY: string
}

const EnvSchema = z
  .object({
    ENVIRONMENT: z.enum(["local", "preview", "production"]).default("local"),
    PUBLIC_BASE_URL: z.url(),
    TWITCH_CLIENT_ID: z.string().min(1),
    TWITCH_REDIRECT_URI: z.url(),
    EVENTSUB_CALLBACK_URL: z.url(),
    // base64url-encoded uncompressed EC public key (65 bytes → 87 chars)
    VAPID_PUBLIC_KEY: z.string().length(87),
    // RFC 8292: must be mailto: URI or HTTPS URL
    VAPID_SUBJECT: z.union([z.string().startsWith("mailto:"), z.url()]),
    TWITCH_CLIENT_SECRET: z.string().min(1),
    // Twitch enforces a max of 100 chars for webhook secrets
    EVENTSUB_WEBHOOK_SECRET: z.string().min(1).max(100),
    TOKEN_ENCRYPTION_KEY: z.string().min(1),
    // base64url-encoded EC private key (32 bytes → 43 chars)
    VAPID_PRIVATE_KEY: z.string().length(43),
  })
  .transform((d) => ({
    environment: d.ENVIRONMENT,
    publicBaseUrl: d.PUBLIC_BASE_URL,
    twitchClientId: d.TWITCH_CLIENT_ID,
    twitchRedirectUri: d.TWITCH_REDIRECT_URI,
    eventsubCallbackUrl: d.EVENTSUB_CALLBACK_URL,
    vapidPublicKey: d.VAPID_PUBLIC_KEY,
    vapidSubject: d.VAPID_SUBJECT,
    twitchClientSecret: d.TWITCH_CLIENT_SECRET,
    eventsubWebhookSecret: d.EVENTSUB_WEBHOOK_SECRET,
    tokenEncryptionKey: d.TOKEN_ENCRYPTION_KEY,
    vapidPrivateKey: d.VAPID_PRIVATE_KEY,
  }))

export type AppConfig = z.infer<typeof EnvSchema>

export type HonoEnv = {
  Bindings: Env
  Variables: {
    db: Database
    config: AppConfig
  }
}

export const parseEnv = (env: Env): AppConfig => EnvSchema.parse(env)
