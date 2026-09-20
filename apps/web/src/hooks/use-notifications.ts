import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import { api } from "@/lib/api"

export function useSnoozeNotification() {
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
  })
}
