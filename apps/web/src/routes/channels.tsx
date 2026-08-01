import { useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChannelRow } from "@/components/channel-row"
import { ChannelPreferencesSheet } from "@/components/channel-preferences-sheet"
import { ReconnectRequired } from "@/components/reconnect-required"
import { useAuth } from "@/context/auth-context"
import { useFollowedChannels, useSyncFollows } from "@/hooks/use-channels"
import { cn } from "@/lib/utils"
import type { FollowedChannel } from "@/types/channel"

export function ChannelsPage() {
  const { data: channels, isLoading, isError } = useFollowedChannels()
  const { reconnectRequired } = useAuth()
  const syncFollows = useSyncFollows()
  const [configuringChannel, setConfiguringChannel] =
    useState<FollowedChannel | null>(null)

  const { live, offline } = useMemo(() => {
    const list = channels ?? []
    return {
      live: list.filter((channel) => channel.is_live),
      offline: list.filter((channel) => !channel.is_live),
    }
  }, [channels])

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">Channels</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={syncFollows.isPending}
          onClick={() => syncFollows.mutate()}
        >
          <RefreshCw
            className={cn("size-3.5", syncFollows.isPending && "animate-spin")}
          />
          Sync
        </Button>
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
          Failed to load channels. Try syncing or reload the page.
        </p>
      )}

      {!isLoading && !isError && channels && channels.length === 0 && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No followed channels yet. Sync to pull your Twitch follows.
        </p>
      )}

      {!isLoading && !isError && live.length > 0 && (
        <section>
          <h2 className="px-4 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase">
            Live
          </h2>
          {live.map((channel) => (
            <ChannelRow
              key={channel.broadcaster_user_id}
              channel={channel}
              onConfigure={setConfiguringChannel}
            />
          ))}
        </section>
      )}

      {!isLoading && !isError && offline.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase">
            Offline
          </h2>
          {offline.map((channel) => (
            <ChannelRow
              key={channel.broadcaster_user_id}
              channel={channel}
              onConfigure={setConfiguringChannel}
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
    </div>
  )
}
