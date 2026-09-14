import type { ChannelPreference } from "@/types/preference"
import type { FollowedChannel } from "@/types/channel"

export interface AlertCategory {
  preferenceId: string
  categoryId: string
  categoryName: string
  /** True when an active global preference covers this same category. */
  alsoGlobal: boolean
}

export interface ChannelAlertGroup {
  broadcasterUserId: string
  displayName: string
  profileImageUrl: string | null
  isLive: boolean
  viewerCount: number | null
  /**
   * True when the channel is absent from the synced followed-channel list, so
   * only its id is known. These sort last and cannot open the preference sheet.
   */
  isUnsynced: boolean
  categories: AlertCategory[]
}

/**
 * Groups per-channel preferences into one entry per broadcaster, resolving
 * display metadata against the followed-channel list and flagging categories
 * that an active global preference already covers.
 *
 * Ordering matches the Channels page (specs/mvp/02. ui-layout.md): live first
 * by viewer count descending, then offline by display name ascending, then any
 * channel missing from the followed list.
 */
export function buildChannelAlertGroups(
  channelPreferences: ChannelPreference[],
  channels: FollowedChannel[],
  globalCategoryIds: string[],
): ChannelAlertGroup[] {
  const channelById = new Map(
    channels.map((channel) => [channel.broadcaster_user_id, channel]),
  )
  const globalIds = new Set(globalCategoryIds)
  const groups = new Map<string, ChannelAlertGroup>()

  for (const preference of channelPreferences) {
    const id = preference.broadcaster_user_id
    let group = groups.get(id)

    if (!group) {
      const channel = channelById.get(id)
      group = {
        broadcasterUserId: id,
        displayName: channel?.broadcaster_display_name ?? id,
        profileImageUrl: channel?.broadcaster_profile_image_url ?? null,
        isLive: channel?.is_live ?? false,
        viewerCount: channel?.viewer_count ?? null,
        isUnsynced: channel === undefined,
        categories: [],
      }
      groups.set(id, group)
    }

    group.categories.push({
      preferenceId: preference.id,
      categoryId: preference.category_id,
      categoryName: preference.category_name,
      alsoGlobal: globalIds.has(preference.category_id),
    })
  }

  for (const group of groups.values()) {
    group.categories.sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName, undefined, {
        sensitivity: "base",
      }),
    )
  }

  return [...groups.values()].sort(compareGroups)
}

/**
 * Filters already-built channel alert groups by a case-insensitive substring
 * match against display name, mirroring `channel-filters.ts`'s
 * `matchesSearch`. An empty/whitespace-only query matches everything.
 */
export function filterChannelAlertGroups(
  groups: ChannelAlertGroup[],
  search: string,
): ChannelAlertGroup[] {
  const query = search.trim().toLowerCase()
  if (query === "") return groups
  return groups.filter((group) =>
    group.displayName.toLowerCase().includes(query),
  )
}

function rank(group: ChannelAlertGroup): number {
  if (group.isUnsynced) return 2
  return group.isLive ? 0 : 1
}

function compareGroups(a: ChannelAlertGroup, b: ChannelAlertGroup): number {
  const rankDelta = rank(a) - rank(b)
  if (rankDelta !== 0) return rankDelta

  if (rank(a) === 0) {
    return (b.viewerCount ?? 0) - (a.viewerCount ?? 0)
  }

  return a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: "base",
  })
}
