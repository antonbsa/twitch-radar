import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { showEnablePushToast } from "@/lib/push-toast"
import type { FollowedChannel } from "@/types/channel"

interface ChannelPreferencesDialogProps {
  channel: FollowedChannel | null
  onOpenChange: (open: boolean) => void
}

export function ChannelPreferencesDialog({
  channel,
  onOpenChange,
}: ChannelPreferencesDialogProps) {
  const { data: preferences, isLoading } = usePreferences()
  const { t } = useLanguage()
  const addPreference = useAddChannelPreference()
  const removePreference = useRemoveChannelPreference()
  const { armedId: armedChipId, arm: armChip } = useArmedChip()
  const push = usePushNotifications()

  function handlePreferenceAdded() {
    showEnablePushToast({ status: push.status, enable: push.enable, t })
  }

  const savedForChannel = channel
    ? (preferences?.channel ?? []).filter(
        (pref) => pref.broadcaster_user_id === channel.broadcaster_user_id,
      )
    : []

  return (
    <Dialog open={channel !== null} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader className="p-4 pr-12">
          <DialogTitle>{channel?.broadcaster_display_name}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
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

          <CategorySearchList
            disabledCategoryIds={savedForChannel.map(
              (pref) => pref.category_id,
            )}
            globalCategoryIds={(preferences?.global ?? []).map(
              (pref) => pref.category_id,
            )}
            autoFocus={false}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
