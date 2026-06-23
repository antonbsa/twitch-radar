import type { EnvironmentName, NotificationJobMessage, TwitchEventQueueMessage } from "./domain/types";

export interface Env {
  DB: D1Database;
  APP_CACHE: KVNamespace;
  TWITCH_EVENTS_QUEUE: Queue<TwitchEventQueueMessage>;
  NOTIFICATION_JOBS_QUEUE: Queue<NotificationJobMessage>;
  ENVIRONMENT?: EnvironmentName;
  PUBLIC_BASE_URL: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_REDIRECT_URI: string;
  EVENTSUB_CALLBACK_URL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  TWITCH_CLIENT_SECRET?: string;
  EVENTSUB_WEBHOOK_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

export interface AppConfig {
  environment: EnvironmentName;
  publicBaseUrl: string;
  twitchClientId: string;
  twitchRedirectUri: string;
  eventsubCallbackUrl: string;
  vapidPublicKey: string;
  vapidSubject: string;
}

export function loadConfig(env: Env): AppConfig {
  return {
    environment: env.ENVIRONMENT ?? "local",
    publicBaseUrl: env.PUBLIC_BASE_URL,
    twitchClientId: env.TWITCH_CLIENT_ID,
    twitchRedirectUri: env.TWITCH_REDIRECT_URI,
    eventsubCallbackUrl: env.EVENTSUB_CALLBACK_URL,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidSubject: env.VAPID_SUBJECT
  };
}

export function requireSecret(env: Env, key: keyof Env): string {
  const value = env[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required secret: ${String(key)}`);
  }

  return value;
}
