import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ApiRequestError } from "@/lib/errors"
import {
  clearStoredSubscriptionId,
  getExistingPushSubscription,
  getStoredSubscriptionId,
  isPushSupported,
  storeSubscriptionId,
  subscribeToPush,
} from "@/lib/push"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import type { PushSubscriptionRecord } from "@/types/push"

// Status states and transitions are specced in T-005 (see also ADR 0027):
// "enabled" means permission is granted AND this device holds an active
// push subscription — permission alone is not enough to receive anything.
export type PushStatus =
  "checking" | "unsupported" | "denied" | "not-enabled" | "enabled"

async function savePushSubscription(
  subscription: PushSubscription,
): Promise<PushSubscriptionRecord> {
  const res = await api.post<{ data: PushSubscriptionRecord }>(
    "/push-subscriptions",
    subscription.toJSON(),
  )
  storeSubscriptionId(res.data.id)
  return res.data
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>(() =>
    isPushSupported() ? "checking" : "unsupported",
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) return
    let cancelled = false
    ;(async () => {
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied")
        return
      }
      const subscription = await getExistingPushSubscription().catch(() => null)
      if (!cancelled) setStatus(subscription ? "enabled" : "not-enabled")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enableMutation = useSessionAwareMutation({
    mutationFn: async (): Promise<PushStatus> => {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        return permission === "denied" ? "denied" : "not-enabled"
      }
      const key = await api.get<{ data: { vapid_public_key: string } }>(
        "/push/vapid-public-key",
      )
      const subscription = await subscribeToPush(key.data.vapid_public_key)
      await savePushSubscription(subscription)
      return "enabled"
    },
    onSuccess: (next) => {
      setStatus(next)
      // "denied" needs no extra error — the UI already explains that state.
      setError(
        next === "not-enabled"
          ? "Notification permission was not granted."
          : null,
      )
    },
    onError: () => setError("Could not enable notifications. Try again."),
  })

  const disableMutation = useSessionAwareMutation({
    mutationFn: async () => {
      const subscription = await getExistingPushSubscription()
      if (!subscription) {
        clearStoredSubscriptionId()
        return
      }
      // A missing or stale cached id is recovered by re-posting the
      // subscription: the upsert returns the existing record (ADR 0027).
      const id =
        getStoredSubscriptionId() ??
        (await savePushSubscription(subscription)).id
      try {
        await api.delete<void>(`/push-subscriptions/${id}`)
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          const recovered = await savePushSubscription(subscription)
          await api.delete<void>(`/push-subscriptions/${recovered.id}`)
        } else {
          throw err
        }
      }
      await subscription.unsubscribe()
      clearStoredSubscriptionId()
    },
    onSuccess: () => {
      setStatus("not-enabled")
      setError(null)
    },
    onError: () => setError("Could not disable notifications. Try again."),
  })

  return {
    status,
    error,
    isPending: enableMutation.isPending || disableMutation.isPending,
    enable: () => enableMutation.mutate(),
    disable: () => disableMutation.mutate(),
  }
}
