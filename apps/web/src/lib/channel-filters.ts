import type { FollowedChannel } from "@/types/channel"

export type ChannelSort = "viewers" | "alphabetical"
export type LiveFilter = "all" | "live"

export const ALL_CATEGORIES = "all" as const

export interface ChannelFilters {
  search: string
  liveFilter: LiveFilter
  category: string
  sort: ChannelSort
}

export const DEFAULT_CHANNEL_FILTERS: ChannelFilters = {
  search: "",
  liveFilter: "all",
  category: ALL_CATEGORIES,
  sort: "viewers",
}

/** Distinct category names present across the given channels' live state, in first-seen order. */
export function deriveLiveCategories(channels: FollowedChannel[]): string[] {
  const seen = new Set<string>()
  for (const channel of channels) {
    if (channel.is_live && channel.category_name) {
      seen.add(channel.category_name)
    }
  }
  return Array.from(seen)
}

function matchesSearch(channel: FollowedChannel, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (query === "") return true
  return (
    channel.broadcaster_display_name.toLowerCase().includes(query) ||
    channel.broadcaster_login.toLowerCase().includes(query)
  )
}

function sortByName(a: FollowedChannel, b: FollowedChannel): number {
  return a.broadcaster_display_name.localeCompare(b.broadcaster_display_name)
}

function sortLive(channels: FollowedChannel[], sort: ChannelSort) {
  const sorted = [...channels]
  if (sort === "alphabetical") {
    sorted.sort(sortByName)
  } else {
    sorted.sort((a, b) => {
      const diff = (b.viewer_count ?? 0) - (a.viewer_count ?? 0)
      return diff !== 0 ? diff : sortByName(a, b)
    })
  }
  return sorted
}

function sortOffline(channels: FollowedChannel[]) {
  return [...channels].sort(sortByName)
}

/**
 * Splits and orders the already-fetched followed-channels list per the user's
 * search/filter/sort choices. Entirely client-side — see issue #33.
 */
export function applyChannelFilters(
  channels: FollowedChannel[],
  filters: ChannelFilters,
): { live: FollowedChannel[]; offline: FollowedChannel[] } {
  const searched = channels.filter((channel) =>
    matchesSearch(channel, filters.search),
  )

  const live = searched.filter((channel) => {
    if (!channel.is_live) return false
    if (filters.category === ALL_CATEGORIES) return true
    return channel.category_name === filters.category
  })

  const offline =
    filters.liveFilter === "live"
      ? []
      : searched.filter((channel) => !channel.is_live)

  return {
    live: sortLive(live, filters.sort),
    offline: sortOffline(offline),
  }
}
