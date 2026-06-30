export type PushSubscriptionPayload = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export type PushSubscriptionRecord = {
  id: string
  subscription: PushSubscriptionPayload
  createdAt: string
  updatedAt: string
}

export type NotificationStatus = "waiting" | "triggered" | "failed"

export type NotificationRecord = {
  id: string
  subscriptionId: string
  channelId: string
  channelLabel: string
  delaySeconds: number
  status: NotificationStatus
  createdAt: string
  scheduledFor: string
  triggeredAt: string | null
  errorMessage?: string
}
