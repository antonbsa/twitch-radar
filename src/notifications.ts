import { nanoid } from "nanoid";
import { findChannel } from "./channels.js";
import { sendPushNotification } from "./push.js";
import { readCollection, writeCollection } from "./storage.js";
import type { NotificationRecord, PushSubscriptionRecord } from "./types.js";

const subscriptionsFile = "subscriptions.json";
const notificationsFile = "notifications.json";
const timers = new Map<string, NodeJS.Timeout>();

export async function upsertSubscription(subscription: PushSubscriptionRecord["subscription"]): Promise<PushSubscriptionRecord> {
  const subscriptions = await readCollection<PushSubscriptionRecord>(subscriptionsFile);
  const now = new Date().toISOString();
  const existingIndex = subscriptions.findIndex((record) => record.subscription.endpoint === subscription.endpoint);

  if (existingIndex >= 0) {
    const updated = {
      ...subscriptions[existingIndex],
      subscription,
      updatedAt: now
    };
    subscriptions[existingIndex] = updated;
    await writeCollection(subscriptionsFile, subscriptions);
    return updated;
  }

  const created = {
    id: nanoid(),
    subscription,
    createdAt: now,
    updatedAt: now
  };

  subscriptions.push(created);
  await writeCollection(subscriptionsFile, subscriptions);
  return created;
}

export async function createNotification(subscriptionId: string, channelId: string): Promise<NotificationRecord> {
  const subscriptions = await readCollection<PushSubscriptionRecord>(subscriptionsFile);
  const subscription = subscriptions.find((record) => record.id === subscriptionId);

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  const channel = findChannel(channelId);

  if (!channel) {
    throw new Error("Unknown channel.");
  }

  const createdAt = new Date();
  const scheduledFor = new Date(createdAt.getTime() + channel.delaySeconds * 1000);
  const notification: NotificationRecord = {
    id: nanoid(),
    subscriptionId,
    channelId: channel.id,
    channelLabel: channel.label,
    delaySeconds: channel.delaySeconds,
    status: "waiting",
    createdAt: createdAt.toISOString(),
    scheduledFor: scheduledFor.toISOString(),
    triggeredAt: null
  };

  const notifications = await readCollection<NotificationRecord>(notificationsFile);
  notifications.push(notification);
  await writeCollection(notificationsFile, notifications);
  scheduleNotification(notification);

  return notification;
}

export async function listNotifications(subscriptionId: string): Promise<NotificationRecord[]> {
  const notifications = await readCollection<NotificationRecord>(notificationsFile);

  return notifications
    .filter((notification) => notification.subscriptionId === subscriptionId)
    .sort((a, b) => {
      if (a.status === "waiting" && b.status !== "waiting") return -1;
      if (a.status !== "waiting" && b.status === "waiting") return 1;

      if (a.status === "waiting" && b.status === "waiting") {
        return Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor);
      }

      return Date.parse(b.triggeredAt ?? b.scheduledFor) - Date.parse(a.triggeredAt ?? a.scheduledFor);
    });
}

export async function hydrateNotificationTimers(): Promise<void> {
  const notifications = await readCollection<NotificationRecord>(notificationsFile);

  for (const notification of notifications) {
    if (notification.status !== "waiting") {
      continue;
    }

    scheduleNotification(notification);
  }
}

function scheduleNotification(notification: NotificationRecord): void {
  clearNotificationTimer(notification.id);

  const delayMs = Math.max(0, Date.parse(notification.scheduledFor) - Date.now());
  const timer = setTimeout(() => {
    void triggerNotification(notification.id);
  }, delayMs);

  timers.set(notification.id, timer);
}

function clearNotificationTimer(notificationId: string): void {
  const timer = timers.get(notificationId);

  if (timer) {
    clearTimeout(timer);
    timers.delete(notificationId);
  }
}

async function triggerNotification(notificationId: string): Promise<void> {
  clearNotificationTimer(notificationId);

  const [notifications, subscriptions] = await Promise.all([
    readCollection<NotificationRecord>(notificationsFile),
    readCollection<PushSubscriptionRecord>(subscriptionsFile)
  ]);

  const notificationIndex = notifications.findIndex((record) => record.id === notificationId);
  const notification = notifications[notificationIndex];

  if (!notification || notification.status !== "waiting") {
    return;
  }

  const subscription = subscriptions.find((record) => record.id === notification.subscriptionId);

  if (!subscription) {
    notifications[notificationIndex] = {
      ...notification,
      status: "failed",
      errorMessage: "Subscription not found."
    };
    await writeCollection(notificationsFile, notifications);
    return;
  }

  try {
    await sendPushNotification(subscription.subscription, {
      title: `${notification.channelLabel} is live`,
      body: `Test notification fired after ${notification.delaySeconds} seconds.`,
      url: "/"
    });

    notifications[notificationIndex] = {
      ...notification,
      status: "triggered",
      triggeredAt: new Date().toISOString()
    };
  } catch (error) {
    notifications[notificationIndex] = {
      ...notification,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown push error."
    };
  }

  await writeCollection(notificationsFile, notifications);
}
