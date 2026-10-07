import type { FollowedChannel } from "@/types/channel"

export type ChannelSort = "viewers" | "alphabetical"

export interface ChannelFilters {
  search: string
  // Empty means no category restriction (all categories) - the default.
  categories: string[]
  // Restricts to categories with an active alert; mutually exclusive with `categories`.
  alertsOnly: boolean
  sort: ChannelSort
}

export const DEFAULT_CHANNEL_FILTERS: ChannelFilters = {
  search: "",
  categories: [],
  alertsOnly: false,
  sort: "viewers",
}

export interface LiveCategoryCount {
  name: string
  liveCount: number
  /** A live channel in this category matches an active alert preference. */
  hasAlert: boolean
}

/** Categories of the live channels with how many are live in each, most broadcasters first, then alphabetically. */
export function deriveLiveCategories(
  channels: FollowedChannel[],
  hasAlert: (channel: FollowedChannel) => boolean = () => false,
): LiveCategoryCount[] {
  const categories = new Map<string, LiveCategoryCount>()
  for (const channel of channels) {
    if (!channel.is_live || !channel.category_name) continue
    const entry = categories.get(channel.category_name) ?? {
      name: channel.category_name,
      liveCount: 0,
      hasAlert: false,
    }
    entry.liveCount += 1
    entry.hasAlert ||= hasAlert(channel)
    categories.set(channel.category_name, entry)
  }
  return Array.from(categories.values()).sort(
    (a, b) => b.liveCount - a.liveCount || a.name.localeCompare(b.name),
  )
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
  hasAlert: (channel: FollowedChannel) => boolean = () => false,
): { live: FollowedChannel[]; offline: FollowedChannel[] } {
  const searched = channels.filter((channel) =>
    matchesSearch(channel, filters.search),
  )

  const allowedCategories = filters.alertsOnly
    ? deriveLiveCategories(channels, hasAlert)
        .filter((category) => category.hasAlert)
        .map((category) => category.name)
    : filters.categories

  const live = searched.filter((channel) => {
    if (!channel.is_live) return false
    if (!filters.alertsOnly && allowedCategories.length === 0) return true
    return (
      channel.category_name !== null &&
      allowedCategories.includes(channel.category_name)
    )
  })

  const offline = searched.filter((channel) => !channel.is_live)

  return {
    live: sortLive(live, filters.sort),
    offline: sortOffline(offline),
  }
}
