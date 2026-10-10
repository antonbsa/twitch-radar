import { useEffect } from "react"
import { toast } from "sonner"
import { useLanguage } from "@/context/language-context"
import {
  useNotificationSnoozes,
  useSnoozeNotification,
} from "@/hooks/use-notifications"
import { interpolateNodes } from "@/lib/i18n-react"
import type { LiveCategory } from "@/routes/channels/live-category"
import type { FollowedChannel } from "@/types/channel"

/** "Remind me in 15m" state and action for a live channel. */
export function useChannelSnooze(
  channel: FollowedChannel | null,
  liveCategory: LiveCategory | null,
) {
  const { tRaw } = useLanguage()
  const snoozeNotification = useSnoozeNotification()
  const { data: pendingSnoozes } = useNotificationSnoozes()

  // Each open is a fresh channel — drop any pending/success/error state left
  // over from a previous one before it's shown for a new broadcaster.
  const resetSnooze = snoozeNotification.reset
  useEffect(() => {
    resetSnooze()
  }, [channel?.broadcaster_user_id, resetSnooze])

  // Only one pending reminder per broadcaster/category is allowed.
  const hasPendingSnooze =
    liveCategory !== null &&
    (pendingSnoozes ?? []).some(
      (snooze) =>
        snooze.broadcaster_user_id === channel?.broadcaster_user_id &&
        snooze.category_id === liveCategory.id,
    )

  function snooze() {
    if (!channel || !liveCategory) return
    snoozeNotification.mutate(
      {
        broadcasterUserId: channel.broadcaster_user_id,
        categoryId: liveCategory.id,
      },
      {
        onSuccess: () =>
          toast.success(
            interpolateNodes(tRaw("channel_detail.snooze_toast"), {
              channelName: <strong>{channel.broadcaster_display_name}</strong>,
              categoryName: <strong>{liveCategory.name}</strong>,
            }),
          ),
      },
    )
  }

  return {
    isSnoozed: snoozeNotification.isSuccess || hasPendingSnooze,
    isPending: snoozeNotification.isPending,
    isError: snoozeNotification.isError,
    snooze,
  }
}
