import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { api } from "@/lib/api"
import { showMutationErrorToast } from "@/lib/error-toast"
import type { User } from "@/types/user"

export interface NotificationSnooze {
  id: string
  user_id: string
  broadcaster_user_id: string
  category_id: string
  fire_at: string
  status: string
  created_at: string
}

const NOTIFICATION_SNOOZES_QUERY_KEY = ["notification-snoozes"]

/** The current user's pending reminder snoozes. */
export function useNotificationSnoozes() {
  return useQuery({
    queryKey: NOTIFICATION_SNOOZES_QUERY_KEY,
    queryFn: () =>
      api.get<{ data: NotificationSnooze[] }>("/notifications/snoozes"),
    select: (res) => res.data,
  })
}

export function useSnoozeNotification() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: ({
      broadcasterUserId,
      categoryId,
    }: {
      broadcasterUserId: string
      categoryId: string
    }) =>
      api.post("/notifications/snooze", {
        broadcaster_user_id: broadcasterUserId,
        category_id: categoryId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_SNOOZES_QUERY_KEY,
      }),
  })
}

/** Pauses or resumes all notifications (ADR 0054). */
export function useSetNotificationsPaused() {
  const { markNotificationsPaused } = useAuth()
  const { t } = useLanguage()

  return useSessionAwareMutation({
    mutationFn: (paused: boolean) =>
      api.patch<{ data: User }>("/me/notifications-paused", { paused }),
    onSuccess: (res) =>
      markNotificationsPaused(res.data.notifications_paused_at),
    onError: (error) => showMutationErrorToast(error, t("alerts.pause_error")),
  })
}

export interface BroadcasterMute {
  id: string
  broadcaster_user_id: string
  created_at: string
}

const BROADCASTER_MUTES_QUERY_KEY = ["broadcaster-mutes"]

/** The current user's active broadcaster mutes (ADR 0054). */
export function useBroadcasterMutes() {
  return useQuery({
    queryKey: BROADCASTER_MUTES_QUERY_KEY,
    queryFn: () => api.get<{ data: BroadcasterMute[] }>("/notifications/mutes"),
    select: (res) => res.data,
  })
}

export function useMuteBroadcaster() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  return useSessionAwareMutation({
    mutationFn: (broadcasterUserId: string) =>
      api.post("/notifications/mutes", {
        broadcaster_user_id: broadcasterUserId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: BROADCASTER_MUTES_QUERY_KEY }),
    onError: (error) => showMutationErrorToast(error, t("mute.mute_error")),
  })
}

export function useUnmuteBroadcaster() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  return useSessionAwareMutation({
    mutationFn: (muteId: string) =>
      api.delete(`/notifications/mutes/${muteId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: BROADCASTER_MUTES_QUERY_KEY }),
    onError: (error) => showMutationErrorToast(error, t("mute.unmute_error")),
  })
}
