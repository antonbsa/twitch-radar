import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import { FOLLOWED_CHANNELS_QUERY_KEY } from "@/hooks/use-followed-channels"

export function useSyncFollows() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/sync/follows"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLLOWED_CHANNELS_QUERY_KEY })
    },
  })
}
