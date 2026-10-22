import type { BroadcasterMute } from "@/hooks/use-notifications"
import type { FollowedChannel } from "@/types/channel"
import type { PreferencesResponse } from "@/types/preference"

/** What a live channel's current category would trigger, mirroring the API's ADR 0054 order. */
export type AlertMatch = "global" | "channel" | "muted" | null

export interface AlertMatcher {
  match(channel: FollowedChannel): AlertMatch
  /** An active global preference covers this broadcaster in this category, exclusions applied. */
  coversGlobally(broadcasterUserId: string, categoryId: string): boolean
  isMuted(broadcasterUserId: string): boolean
}

/**
 * Client copy of the API's suppression rule (ADR 0054, `matchAndCreateDeliveries`
 * in apps/api/src/features/notifications/match.ts); the web can't import API
 * code (ADR 0028), so keep the two in step. User-level pause is deliberately
 * left out: the paused banner covers it and counting it would empty "Alerts only".
 */
export function createAlertMatcher(
  preferences: PreferencesResponse | undefined,
  mutes: BroadcasterMute[] | undefined,
): AlertMatcher {
  // category id -> broadcasters excluded from each global preference on it
  const globalExclusions = new Map<string, Set<string>[]>()
  for (const pref of preferences?.global ?? []) {
    const excluded = new Set(pref.exclusions.map((e) => e.broadcaster_user_id))
    globalExclusions.set(pref.category_id, [
      ...(globalExclusions.get(pref.category_id) ?? []),
      excluded,
    ])
  }
  const channelKeys = new Set(
    (preferences?.channel ?? []).map(
      (p) => `${p.broadcaster_user_id}:${p.category_id}`,
    ),
  )
  const mutedIds = new Set((mutes ?? []).map((m) => m.broadcaster_user_id))

  const coversGlobally = (broadcasterUserId: string, categoryId: string) =>
    (globalExclusions.get(categoryId) ?? []).some(
      (excluded) => !excluded.has(broadcasterUserId),
    )
  const isMuted = (broadcasterUserId: string) => mutedIds.has(broadcasterUserId)

  return {
    coversGlobally,
    isMuted,
    match(channel) {
      if (!channel.is_live || !channel.category_id) return null
      const id = channel.broadcaster_user_id
      let source: "global" | "channel" | null = null
      if (coversGlobally(id, channel.category_id)) source = "global"
      else if (channelKeys.has(`${id}:${channel.category_id}`))
        source = "channel"
      if (source === null) return null
      return isMuted(id) ? "muted" : source
    },
  }
}
