import { useLanguage } from "@/context/language-context"
import {
  useAddChannelPreference,
  usePreferences,
} from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { showEnablePushToast } from "@/lib/push-toast"
import type { LiveCategory } from "@/routes/channels/live-category"
import type { FollowedChannel } from "@/types/channel"

/** "Notify me for this category" state and action for a live channel. */
export function useChannelCategoryNotify(
  channel: FollowedChannel | null,
  liveCategory: LiveCategory | null,
) {
  const { t } = useLanguage()
  const { data: preferences } = usePreferences()
  const addPreference = useAddChannelPreference()
  const push = usePushNotifications()

  const isNotifying =
    liveCategory !== null &&
    (preferences?.channel ?? []).some(
      (pref) =>
        pref.broadcaster_user_id === channel?.broadcaster_user_id &&
        pref.category_id === liveCategory.id,
    )

  function notify() {
    if (!channel || !liveCategory) return
    addPreference.mutate(
      {
        broadcasterUserId: channel.broadcaster_user_id,
        category: liveCategory,
      },
      {
        onSuccess: () =>
          showEnablePushToast({ status: push.status, enable: push.enable, t }),
      },
    )
  }

  return { isNotifying, isPending: addPreference.isPending, notify }
}
