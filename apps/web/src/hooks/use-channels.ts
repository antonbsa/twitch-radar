import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
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
    mutationFn: () => api.post<{ ok: boolean }>("/sync/follows"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLLOWED_CHANNELS_QUERY_KEY })
    },
  })
}
