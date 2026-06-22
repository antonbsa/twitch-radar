import webPush from "web-push";
import type { PushSubscriptionPayload } from "./types.js";

export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getPushConfig(): PushConfig {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:dev@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY. Run `npm run vapid` and copy the keys into .env.");
  }

  return { publicKey, privateKey, subject };
}

export function configurePush(config: PushConfig): void {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export async function sendPushNotification(
  subscription: PushSubscriptionPayload,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  await webPush.sendNotification(subscription, JSON.stringify(payload));
}
