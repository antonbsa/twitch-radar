import { useEffect, useState } from "react"
import { useLanguage } from "@/context/language-context"
import { api } from "@/lib/api"
import { showMutationErrorToast } from "@/lib/error-toast"
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

// Mirrors apps/api's PushSubscriptionRecord snake_case fields exactly (not
// shared/imported across the workspace boundary — see ADR 0028).
interface PushSubscriptionRecord {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}

// Status states and transitions follow ADR 0027:
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
  // Only the "permission not granted" outcome lives here, rendered inline on
  // the Account tab; enable/disable failures are toasts instead (#24).
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

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
      // A catalog key, not literal text — the caller (AccountPage) resolves
      // it via useLanguage().t() where it renders it (ADR 0044).
      setError(next === "not-enabled" ? "push.permission_not_granted" : null)
    },
    onError: (err) => {
      setError(null)
      showMutationErrorToast(err, t("push.enable_error"))
    },
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
    onError: (err) => showMutationErrorToast(err, t("push.disable_error")),
  })

  return {
    status,
    error,
    isPending: enableMutation.isPending || disableMutation.isPending,
    enable: () => enableMutation.mutate(),
    disable: () => disableMutation.mutate(),
  }
}
