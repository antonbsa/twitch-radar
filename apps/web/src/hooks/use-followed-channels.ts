import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { FollowedChannel } from "@/types/channel"

export const FOLLOWED_CHANNELS_QUERY_KEY = ["followed-channels"]

export function useFollowedChannels() {
  return useQuery({
    queryKey: FOLLOWED_CHANNELS_QUERY_KEY,
    queryFn: () => api.get<{ data: FollowedChannel[] }>("/channels/followed"),
    select: (res) => res.data,
  })
}
