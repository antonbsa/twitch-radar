import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChannelRow } from "@/components/channel-row"
import { ChannelFiltersBar } from "@/components/channel-filters-bar"
import { ChannelPreferencesSheet } from "@/components/channel-preferences-sheet"
import { ChannelDetailModal } from "@/components/channel-detail-modal"
import { ReconnectRequired } from "@/components/reconnect-required"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { useFollowedChannels, useSyncFollows } from "@/hooks/use-channels"
import {
  applyChannelFilters,
  DEFAULT_CHANNEL_FILTERS,
  deriveLiveCategories,
  type ChannelFilters,
} from "@/lib/channel-filters"
import { ApiRequestError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { FollowedChannel } from "@/types/channel"

// How long the rate-limit label stays fully visible before it starts fading out.
const SYNC_RATE_LIMIT_LABEL_HOLD_MS = 2500

export function ChannelsPage() {
  const { data: channels, isLoading, isError } = useFollowedChannels()
  const { reconnectRequired } = useAuth()
  const { t } = useLanguage()
  const syncFollows = useSyncFollows()
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

  const hasChannels = (channels?.length ?? 0) > 0
  const hasVisibleResults = live.length > 0 || offline.length > 0

  function updateFilters(patch: Partial<ChannelFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  // Tracked separately from syncFollows.error, which resets to null on every
  // mutate() call — deriving visibility from it directly would blink the label.
  const [syncRateLimited, setSyncRateLimited] = useState(false)
  // Whether the label is fading/faded out. Retriggering while still false
  // (label fully visible) is a no-op, so the fade-in only replays once faded.
  const [labelFaded, setLabelFaded] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

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

  useEffect(() => {
    if (syncFollows.status === "success") {
      setSyncRateLimited(false)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    } else if (syncFollows.status === "error") {
      const isRateLimited =
        syncFollows.error instanceof ApiRequestError &&
        syncFollows.error.code === "sync_rate_limited"
      setSyncRateLimited(isRateLimited)
      if (isRateLimited) {
        setLabelFaded(false)
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = setTimeout(
          () => setLabelFaded(true),
          SYNC_RATE_LIMIT_LABEL_HOLD_MS,
        )
      }
    }
  }, [syncFollows.status, syncFollows.error])

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">{t("channels.title")}</h1>
        <div className="flex items-center gap-2">
          {syncRateLimited && (
            <span
              className={cn(
                "text-xs text-muted-foreground transition-opacity",
                labelFaded
                  ? "opacity-0 duration-800"
                  : "opacity-100 duration-200",
              )}
            >
              {t("channels.sync_rate_limited")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={syncFollows.isPending}
            onClick={() => syncFollows.mutate()}
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

      {isLoading && (
        <div className="space-y-1 px-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && isError && reconnectRequired && <ReconnectRequired />}

      {!isLoading && isError && !reconnectRequired && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("channels.load_error")}
        </p>
      )}

      {!isLoading && !isError && channels && channels.length === 0 && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("channels.empty")}
        </p>
      )}

      {!isLoading && !isError && hasChannels && (
        <ChannelFiltersBar
          filters={filters}
          onChange={updateFilters}
          categories={categories}
        />
      )}

      {!isLoading && !isError && hasChannels && !hasVisibleResults && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("channels.no_matches")}
        </p>
      )}

      {!isLoading && !isError && live.length > 0 && (
        <section>
          <h2 className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase">
            {t("channels.live")}
          </h2>
          {live.map((channel) => (
            <ChannelRow
              key={channel.broadcaster_user_id}
              channel={channel}
              onConfigure={setConfiguringChannel}
              onOpenDetail={setDetailChannel}
            />
          ))}
        </section>
      )}

      {!isLoading && !isError && offline.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase">
            {t("channels.offline")}
          </h2>
          {offline.map((channel) => (
            <ChannelRow
              key={channel.broadcaster_user_id}
              channel={channel}
              onConfigure={setConfiguringChannel}
              onOpenDetail={setDetailChannel}
            />
          ))}
        </section>
      )}

      <ChannelPreferencesSheet
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
