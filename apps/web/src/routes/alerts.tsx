import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AddChannelSheet } from "@/components/add-channel-sheet"
import { AddGlobalCategorySheet } from "@/components/add-global-category-sheet"
import { ChannelAlertsCard } from "@/components/channel-alerts-card"
import { ChannelPreferencesSheet } from "@/components/channel-preferences-sheet"
import { GlobalAlertsCard } from "@/components/global-alerts-card"
import { ReconnectRequired } from "@/components/reconnect-required"
import { useAuth } from "@/context/auth-context"
import { useFollowedChannels } from "@/hooks/use-channels"
import { buildChannelAlertGroups } from "@/lib/alert-groups"
import {
  usePreferences,
  useRemoveChannelPreference,
  useRemoveGlobalPreference,
} from "@/hooks/use-preferences"
import type { FollowedChannel } from "@/types/channel"

export function AlertsPage() {
  const { data: preferences, isLoading, isError } = usePreferences()
  const {
    data: channels,
    isLoading: isChannelsLoading,
    isError: isChannelsError,
  } = useFollowedChannels()
  const { reconnectRequired } = useAuth()
  const removeGlobalPreference = useRemoveGlobalPreference()
  const removeChannelPreference = useRemoveChannelPreference()
  const [addGlobalOpen, setAddGlobalOpen] = useState(false)
  const [addChannelOpen, setAddChannelOpen] = useState(false)
  const [configuringChannel, setConfiguringChannel] =
    useState<FollowedChannel | null>(null)

  const globalPreferences = preferences?.global ?? []
  const channelPreferences = preferences?.channel ?? []

  const groups = useMemo(
    () =>
      buildChannelAlertGroups(
        channelPreferences,
        channels ?? [],
        globalPreferences.map((pref) => pref.category_id),
      ),
    [channelPreferences, channels, globalPreferences],
  )

  // The per-channel section needs both preferences and the followed-channel
  // list (to resolve display names), so it waits on and reports errors
  // from both.
  const channelSectionLoading = isLoading || isChannelsLoading
  const channelSectionError = isError || isChannelsError

  function openChannelSheet(broadcasterUserId: string) {
    const channel = (channels ?? []).find(
      (c) => c.broadcaster_user_id === broadcasterUserId,
    )
    if (channel) setConfiguringChannel(channel)
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-3">
        <h1 className="text-lg font-semibold">Alerts</h1>
      </div>

      <h2 className="px-4 pt-1 pb-2 text-xs font-semibold text-muted-foreground uppercase">
        All channels
      </h2>

      {isLoading && (
        <div className="px-4">
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isLoading && isError && reconnectRequired && <ReconnectRequired />}

      {!isLoading && isError && !reconnectRequired && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Failed to load alerts. Try again later.
        </p>
      )}

      {!isLoading && !isError && (
        <GlobalAlertsCard
          preferences={globalPreferences}
          onAdd={() => setAddGlobalOpen(true)}
          onRemove={(id) => removeGlobalPreference.mutate(id)}
        />
      )}

      <h2 className="px-4 pt-6 pb-2 text-xs font-semibold text-muted-foreground uppercase">
        Per channel
      </h2>

      {channelSectionLoading && (
        <div className="space-y-2 px-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!channelSectionLoading &&
        channelSectionError &&
        !reconnectRequired &&
        !isError && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Failed to load alerts. Try again later.
          </p>
        )}

      {!channelSectionLoading &&
        !channelSectionError &&
        groups.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No per-channel alerts set.
          </p>
        )}

      {!channelSectionLoading &&
        !channelSectionError &&
        groups.map((group) => (
          <ChannelAlertsCard
            key={group.broadcasterUserId}
            group={group}
            onAdd={openChannelSheet}
            onRemove={(id) => removeChannelPreference.mutate(id)}
          />
        ))}

      {!channelSectionLoading && !channelSectionError && (
        <div className="px-4 pt-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAddChannelOpen(true)}
          >
            <Plus className="size-4" />
            Add channel
          </Button>
        </div>
      )}

      <AddGlobalCategorySheet
        open={addGlobalOpen}
        onOpenChange={setAddGlobalOpen}
        disabledCategoryIds={globalPreferences.map((pref) => pref.category_id)}
      />

      <ChannelPreferencesSheet
        channel={configuringChannel}
        onOpenChange={(open) => {
          if (!open) setConfiguringChannel(null)
        }}
      />

      <AddChannelSheet
        open={addChannelOpen}
        onOpenChange={setAddChannelOpen}
        channels={channels ?? []}
        onSelect={(channel) => {
          setAddChannelOpen(false)
          setConfiguringChannel(channel)
        }}
      />
    </div>
  )
}
