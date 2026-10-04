import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useLanguage } from "@/context/language-context"
import { api } from "@/lib/api"
import { showMutationErrorToast } from "@/lib/error-toast"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import type { FollowedChannel } from "@/types/channel"

const FOLLOWED_CHANNELS_QUERY_KEY = ["followed-channels"]

export function useFollowedChannels() {
  return useQuery({
    queryKey: FOLLOWED_CHANNELS_QUERY_KEY,
    queryFn: () => api.get<{ data: FollowedChannel[] }>("/channels/followed"),
    select: (res) => res.data,
  })
}

export function useSyncFollows() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: () => api.post<{ data: FollowedChannel[] }>("/sync/follows"),
    onSuccess: (res) => {
      queryClient.setQueryData(FOLLOWED_CHANNELS_QUERY_KEY, res)
    },
  })
}

/**
 * `useSyncFollows` for a Sync button: the user asked for it, so it toasts the
 * outcome. Toasts go on the `mutate()` call, not in `useSyncFollows`, so an
 * automatic background sync stays silent.
 */
export function useManualSyncFollows() {
  const syncFollows = useSyncFollows()
  const { t } = useLanguage()

  return {
    isPending: syncFollows.isPending,
    sync: () =>
      syncFollows.mutate(undefined, {
        onSuccess: () => toast(t("sync.success")),
        onError: (error) => showMutationErrorToast(error, t("sync.error")),
      }),
  }
}
