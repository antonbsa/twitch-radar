import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { CategorySearchList } from "@/components/category-search-list"
import { CategoryChip } from "@/components/category-chip"
import { useLanguage } from "@/context/language-context"
import { useArmedChip } from "@/hooks/use-armed-chip"
import {
  useAddChannelPreference,
  usePreferences,
  useRemoveChannelPreference,
} from "@/hooks/use-preferences"
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

  const savedForChannel = channel
    ? (preferences?.channel ?? []).filter(
        (pref) => pref.broadcaster_user_id === channel.broadcaster_user_id,
      )
    : []

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          <CategorySearchList
            disabledCategoryIds={savedForChannel.map(
              (pref) => pref.category_id,
            )}
            globalCategoryIds={(preferences?.global ?? []).map(
              (pref) => pref.category_id,
            )}
            onSelect={(category) => {
              if (!channel) return
              addPreference.mutate({
                broadcasterUserId: channel.broadcaster_user_id,
                category,
              })
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
