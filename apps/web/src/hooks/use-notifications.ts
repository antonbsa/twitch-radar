import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import { api } from "@/lib/api"

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

/**
 * The current user's pending reminder snoozes, synced with server state.
 */
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
