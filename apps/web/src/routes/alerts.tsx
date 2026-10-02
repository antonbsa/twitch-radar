import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AddChannelDialog } from "@/components/add-channel-dialog"
import { AddGlobalCategoryDialog } from "@/components/add-global-category-dialog"
import { ChannelAlertsCard } from "@/components/channel-alerts-card"
import { ChannelPreferencesDialog } from "@/components/channel-preferences-dialog"
import { GlobalAlertsCard } from "@/components/global-alerts-card"
import { ReconnectRequired } from "@/components/reconnect-required"
import { SearchField } from "@/components/search-field"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { useArmedChip } from "@/hooks/use-armed-chip"
import { useFollowedChannels } from "@/hooks/use-channels"
import {
  buildChannelAlertGroups,
  filterChannelAlertGroups,
} from "@/lib/alert-groups"
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
  const { t } = useLanguage()
  const removeGlobalPreference = useRemoveGlobalPreference()
  const removeChannelPreference = useRemoveChannelPreference()
  const [addGlobalOpen, setAddGlobalOpen] = useState(false)
  const [addChannelOpen, setAddChannelOpen] = useState(false)
  const [channelSearch, setChannelSearch] = useState("")
  const [configuringChannel, setConfiguringChannel] =
    useState<FollowedChannel | null>(null)
  const { armedId: armedChipId, arm: armChip } = useArmedChip()

  const globalPreferences = useMemo(
    () => preferences?.global ?? [],
    [preferences?.global],
  )
  const channelPreferences = useMemo(
    () => preferences?.channel ?? [],
    [preferences?.channel],
  )

  const groups = useMemo(
    () =>
      buildChannelAlertGroups(
        channelPreferences,
        channels ?? [],
        globalPreferences.map((pref) => pref.category_id),
      ),
    [channelPreferences, channels, globalPreferences],
  )

  const filteredGroups = useMemo(
    () => filterChannelAlertGroups(groups, channelSearch),
    [groups, channelSearch],
  )

  // The per-channel section needs both preferences and the followed-channel
  // list (to resolve display names), so it waits on and reports errors
  // from both.
  const channelSectionLoading = isLoading || isChannelsLoading
  const channelSectionError = isError || isChannelsError
  const channelSectionReady = !channelSectionLoading && !channelSectionError

  function openChannelSheet(broadcasterUserId: string) {
    const channel = (channels ?? []).find(
      (c) => c.broadcaster_user_id === broadcasterUserId,
    )
    if (channel) setConfiguringChannel(channel)
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-3">
        <h1 className="text-lg font-semibold">{t("alerts.title")}</h1>
      </div>

      <h2 className="px-4 pt-1 pb-2 text-base font-semibold text-muted-foreground">
        {t("alerts.global_title")}
      </h2>

      {isLoading && (
        <div className="px-4">
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isLoading && isError && reconnectRequired && <ReconnectRequired />}

      {!isLoading && isError && !reconnectRequired && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("alerts.load_error")}
        </p>
      )}

      {!isLoading && !isError && (
        <GlobalAlertsCard
          preferences={globalPreferences}
          onAdd={() => setAddGlobalOpen(true)}
          onRemove={(id) => removeGlobalPreference.mutate(id)}
          armedChipId={armedChipId}
          onArmChip={armChip}
        />
      )}

      <div className="flex items-center justify-between gap-2 px-4 pt-6 pb-2">
        <h2 className="text-base font-semibold text-muted-foreground">
          {t("alerts.per_channel_title")}
        </h2>

        <div className="flex items-center gap-2">
          {channelSectionReady && groups.length > 0 && (
            <SearchField
              value={channelSearch}
              onChange={setChannelSearch}
              placeholder={t("alerts.channel_search_placeholder")}
              ariaLabel={t("alerts.channel_search_aria")}
              clearLabel={t("alerts.clear_channel_search_aria")}
              // Fixed width rather than flex-1: this row doesn't need the
              // search to claim the whole line.
              className="w-36 sm:w-48"
            />
          )}

          {channelSectionReady && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAddChannelOpen(true)}
              aria-label={t("alerts.add_channel")}
              className="h-11 w-11 shrink-0"
            >
              <Plus className="size-5" />
            </Button>
          )}
        </div>
      </div>

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
            {t("alerts.load_error")}
          </p>
        )}

      {channelSectionReady && groups.length === 0 && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("alerts.channel_empty")}
        </p>
      )}

      {channelSectionReady &&
        groups.length > 0 &&
        filteredGroups.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("alerts.no_channel_matches")}
          </p>
        )}

      {channelSectionReady &&
        filteredGroups.map((group) => (
          <ChannelAlertsCard
            key={group.broadcasterUserId}
            group={group}
            onAdd={openChannelSheet}
            onRemove={(id) => removeChannelPreference.mutate(id)}
            armedChipId={armedChipId}
            onArmChip={armChip}
          />
        ))}

      <AddGlobalCategoryDialog
        open={addGlobalOpen}
        onOpenChange={setAddGlobalOpen}
        disabledCategoryIds={globalPreferences.map((pref) => pref.category_id)}
      />

      <ChannelPreferencesDialog
        channel={configuringChannel}
        onOpenChange={(open) => {
          if (!open) setConfiguringChannel(null)
        }}
      />

      <AddChannelDialog
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
