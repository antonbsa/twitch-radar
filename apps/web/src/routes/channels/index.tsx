import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChannelRow } from "@/routes/channels/components/channel-row"
import { ChannelRowSkeleton } from "@/components/channel-row-skeleton"
import { ChannelFiltersBar } from "@/routes/channels/components/channel-filters-bar"
import { ChannelPreferencesDialog } from "@/components/channel-preferences-dialog"
import { ChannelDetailModal } from "@/routes/channels/components/channel-detail-modal"
import { AsyncSection } from "@/components/async-section"
import { ReconnectRequired } from "@/components/reconnect-required"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import {
  isFollowSyncStale,
  useAutoSyncFollowsStatus,
  useFollowedChannels,
  useManualSyncFollows,
} from "@/hooks/use-channels"
import { useBroadcasterMutes } from "@/hooks/use-notifications"
import { usePreferences } from "@/hooks/use-preferences"
import {
  applyChannelFilters,
  DEFAULT_CHANNEL_FILTERS,
  deriveLiveCategories,
  type ChannelFilters,
} from "@/routes/channels/channel-filters"
import { cn } from "@/lib/utils"
import type { FollowedChannel } from "@/types/channel"

export function ChannelsPage() {
  const {
    data: channels,
    isLoading: isChannelsLoading,
    isError,
  } = useFollowedChannels()
  const { data: preferences } = usePreferences()
  const { data: mutes } = useBroadcasterMutes()
  const mutedIds = useMemo(
    () => new Set((mutes ?? []).map((mute) => mute.broadcaster_user_id)),
    [mutes],
  )
  const { user, reconnectRequired } = useAuth()
  const autoSyncStatus = useAutoSyncFollowsStatus()
  // An auto-sync only runs when the last sync is stale (issue #88): hold the
  // skeleton until it lands instead of painting stale D1 rows that would
  // visibly reorder once the fresh list arrives.
  const isLoading = isChannelsLoading || autoSyncStatus === "pending"
  const autoSyncFailed =
    autoSyncStatus === "error" &&
    isFollowSyncStale(user?.last_follow_sync_at ?? null)
  const { t } = useLanguage()
  const syncFollows = useManualSyncFollows()
  const [configuringChannel, setConfiguringChannel] =
    useState<FollowedChannel | null>(null)
  const [filters, setFilters] = useState<ChannelFilters>(
    DEFAULT_CHANNEL_FILTERS,
  )
  const [detailChannel, setDetailChannel] = useState<FollowedChannel | null>(
    null,
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const appliedDeepLinkRef = useRef(false)

  const categories = useMemo(
    () => deriveLiveCategories(channels ?? []),
    [channels],
  )

  const { live, offline } = useMemo(
    () => applyChannelFilters(channels ?? [], filters),
    [channels, filters],
  )

  const globalCategoryIds = useMemo(
    () => new Set(preferences?.global.map((p) => p.category_id)),
    [preferences],
  )
  const channelCategoryKeys = useMemo(
    () =>
      new Set(
        preferences?.channel.map(
          (p) => `${p.broadcaster_user_id}:${p.category_id}`,
        ),
      ),
    [preferences],
  )

  function preferenceMatchFor(channel: FollowedChannel) {
    if (!channel.is_live || !channel.category_id) return null
    if (globalCategoryIds.has(channel.category_id)) return "global"
    return channelCategoryKeys.has(
      `${channel.broadcaster_user_id}:${channel.category_id}`,
    )
      ? "channel"
      : null
  }

  const hasChannels = (channels?.length ?? 0) > 0
  const hasVisibleResults = live.length > 0 || offline.length > 0

  function updateFilters(patch: Partial<ChannelFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  useEffect(() => {
    if (appliedDeepLinkRef.current) return
    if (!channels) return

    const broadcasterId = searchParams.get("broadcaster")
    if (!broadcasterId) return

    appliedDeepLinkRef.current = true

    const match = channels.find(
      (channel) => channel.broadcaster_user_id === broadcasterId,
    )
    if (match) setDetailChannel(match)

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete("broadcaster")
        return next
      },
      { replace: true },
    )
  }, [channels, searchParams, setSearchParams])

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">{t("channels.title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncFollows.isPending}
            onClick={() => syncFollows.sync()}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                syncFollows.isPending && "animate-spin",
              )}
            />
            {t("channels.sync")}
          </Button>
        </div>
      </div>

      <AsyncSection
        isLoading={isLoading}
        isError={isError}
        skeleton={<ChannelsLoadingSkeleton />}
        errorMessage={t("channels.load_error")}
      >
        {autoSyncFailed && reconnectRequired && <ReconnectRequired />}

        {autoSyncFailed && !reconnectRequired && (
          <p role="status" className="px-4 pb-2 text-xs text-muted-foreground">
            {t("channels.sync_stale_notice")}
          </p>
        )}

        {channels && channels.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("channels.empty")}
          </p>
        )}

        {hasChannels && (
          <ChannelFiltersBar
            filters={filters}
            onChange={updateFilters}
            categories={categories}
          />
        )}

        {hasChannels && !hasVisibleResults && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("channels.no_matches")}
          </p>
        )}

        {live.length > 0 && (
          <section>
            <h2 className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase">
              {t("channels.live")}
            </h2>
            {live.map((channel) => (
              <ChannelRow
                key={channel.broadcaster_user_id}
                channel={channel}
                preferenceMatch={preferenceMatchFor(channel)}
                muted={mutedIds.has(channel.broadcaster_user_id)}
                onConfigure={setConfiguringChannel}
                onOpenDetail={setDetailChannel}
              />
            ))}
          </section>
        )}

        {offline.length > 0 && (
          <section>
            <h2 className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase">
              {t("channels.offline")}
            </h2>
            {offline.map((channel) => (
              <ChannelRow
                key={channel.broadcaster_user_id}
                channel={channel}
                muted={mutedIds.has(channel.broadcaster_user_id)}
                onConfigure={setConfiguringChannel}
                onOpenDetail={setDetailChannel}
              />
            ))}
          </section>
        )}
      </AsyncSection>

      <ChannelPreferencesDialog
        channel={configuringChannel}
        onOpenChange={(open) => {
          if (!open) setConfiguringChannel(null)
        }}
      />

      <ChannelDetailModal
        channel={detailChannel}
        onOpenChange={(open) => {
          if (!open) setDetailChannel(null)
        }}
      />
    </div>
  )
}

/**
 * Mirrors the loaded page chrome (filters bar, LIVE/OFFLINE headers, rows)
 * box for box, so nothing shifts when the list resolves.
 */
function ChannelsLoadingSkeleton() {
  return (
    <div data-testid="channels-loading" aria-busy>
      {/* Search, category trigger and icon-only sort, sized like ChannelFiltersBar. */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <Skeleton className="h-11 flex-1 rounded-lg" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-lg sm:w-36" />
        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
      </div>

      <div className="px-4 pt-2 pb-1">
        <Skeleton className="h-4 w-10" />
      </div>
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />

      <div className="px-4 pt-4 pb-1">
        <Skeleton className="h-4 w-14" />
      </div>
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />
      <ChannelRowSkeleton />
    </div>
  )
}
