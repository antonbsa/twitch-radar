import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CategorySearchList } from "@/components/category-search-list"
import { CategoryChip } from "@/components/category-chip"
import { EnablePushBanner } from "@/components/enable-push-banner"
import { useLanguage } from "@/context/language-context"
import { useArmedChip } from "@/hooks/use-armed-chip"
import {
  useAddChannelPreference,
  usePreferences,
  useRemoveChannelPreference,
} from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import type { FollowedChannel } from "@/types/channel"

interface ChannelPreferencesSheetProps {
  channel: FollowedChannel | null
  onOpenChange: (open: boolean) => void
}

export function ChannelPreferencesSheet({
  channel,
  onOpenChange,
}: ChannelPreferencesSheetProps) {
  const { data: preferences, isLoading } = usePreferences()
  const { t } = useLanguage()
  const addPreference = useAddChannelPreference()
  const removePreference = useRemoveChannelPreference()
  const { armedId: armedChipId, arm: armChip } = useArmedChip()
  const push = usePushNotifications()
  const [showPushPrompt, setShowPushPrompt] = useState(false)

  // Reset the prompt each time the sheet closes so it doesn't carry a
  // dismissed/shown state into the next channel opened.
  useEffect(() => {
    if (channel === null) setShowPushPrompt(false)
  }, [channel])

  function handlePreferenceAdded() {
    if (push.status !== "enabled") setShowPushPrompt(true)
  }

  const savedForChannel = channel
    ? (preferences?.channel ?? []).filter(
        (pref) => pref.broadcaster_user_id === channel.broadcaster_user_id,
      )
    : []

  const liveCategorySuggestion =
    channel?.is_live && channel.category_id && channel.category_name
      ? savedForChannel.some((pref) => pref.category_id === channel.category_id)
        ? null
        : { id: channel.category_id, name: channel.category_name }
      : null

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          {liveCategorySuggestion && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={addPreference.isPending}
              onClick={() => {
                if (!channel) return
                addPreference.mutate(
                  {
                    broadcasterUserId: channel.broadcaster_user_id,
                    category: liveCategorySuggestion,
                  },
                  { onSuccess: handlePreferenceAdded },
                )
              }}
            >
              Notify for &quot;{liveCategorySuggestion.name}&quot;
            </Button>
          )}

          {showPushPrompt && (
            <EnablePushBanner
              status={push.status}
              isPending={push.isPending}
              onEnable={push.enable}
              onDismiss={() => setShowPushPrompt(false)}
            />
          )}

          <CategorySearchList
            disabledCategoryIds={savedForChannel.map(
              (pref) => pref.category_id,
            )}
            globalCategoryIds={(preferences?.global ?? []).map(
              (pref) => pref.category_id,
            )}
            onSelect={(category) => {
              if (!channel) return
              addPreference.mutate(
                {
                  broadcasterUserId: channel.broadcaster_user_id,
                  category,
                },
                { onSuccess: handlePreferenceAdded },
              )
            }}
          />

          <div>
            <p className="text-sm font-medium">
              {t("channel_preferences.saved_for_channel")}
            </p>
            {isLoading ? (
              <Skeleton className="mt-2 h-6 w-24" />
            ) : savedForChannel.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("channel_preferences.no_preferences")}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {savedForChannel.map((pref) => (
                  <CategoryChip
                    key={pref.id}
                    label={pref.category_name}
                    armed={armedChipId === pref.id}
                    onArm={() => armChip(pref.id)}
                    onRemove={() => removePreference.mutate(pref.id)}
                    removeLabel={t("channel_preferences.remove_aria", {
                      category: pref.category_name,
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
