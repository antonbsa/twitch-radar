import type { FollowedChannel } from "@/types/channel"

export interface LiveCategory {
  id: string
  name: string
}

export function getLiveCategory(
  channel: FollowedChannel | null,
): LiveCategory | null {
  return channel?.is_live && channel.category_id && channel.category_name
    ? { id: channel.category_id, name: channel.category_name }
    : null
}
