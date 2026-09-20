import { useEffect, useState } from "react"
import {
  AlarmClockCheckIcon,
  AlarmClockIcon,
  BellCheckIcon,
  BellIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import { useSnoozeNotification } from "@/hooks/use-notifications"
import {
  useAddChannelPreference,
  usePreferences,
} from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { formatViewerCount } from "@/lib/format"
import { showEnablePushToast } from "@/lib/push-toast"
import { cn } from "@/lib/utils"
import type { FollowedChannel } from "@/types/channel"

interface ChannelDetailModalProps {
  channel: FollowedChannel | null
  onOpenChange: (open: boolean) => void
}

function ChannelThumbnail({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  const [loaded, setLoaded] = useState(false)

  if (!thumbnailUrl) {
    return <div className="aspect-video w-full rounded-md bg-muted" />
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={thumbnailUrl}
        alt=""
        className={cn(
          "size-full object-cover transition-opacity",
          loaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export function ChannelDetailModal({
  channel,
  onOpenChange,
}: ChannelDetailModalProps) {
  const { t } = useLanguage()
  const { data: preferences } = usePreferences()
  const addPreference = useAddChannelPreference()
  const push = usePushNotifications()
  const snoozeNotification = useSnoozeNotification()

  // Each open is a fresh channel — drop any pending/success/error state left
  // over from a previous one before it's shown for a new broadcaster.
  const resetSnooze = snoozeNotification.reset
  useEffect(() => {
    resetSnooze()
  }, [channel?.broadcaster_user_id, resetSnooze])

  const liveCategory =
    channel?.is_live && channel.category_id && channel.category_name
      ? { id: channel.category_id, name: channel.category_name }
      : null

  const isNotifyingForCategory =
    liveCategory !== null &&
    (preferences?.channel ?? []).some(
      (pref) =>
        pref.broadcaster_user_id === channel?.broadcaster_user_id &&
        pref.category_id === liveCategory.id,
    )

  function handleNotifyForCategory() {
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

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-lg border data-[side=bottom]:top-1/2 data-[side=bottom]:bottom-auto data-[side=bottom]:-translate-y-1/2 data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-136"
        data-testid="channel-detail-modal"
        data-broadcaster-user-id={channel?.broadcaster_user_id}
        onPointerDownOutside={(event) => {
          // Keep the sheet open when the toast portal is clicked so the
          // Notifying state remains visible after enabling push.
          const target = event.detail.originalEvent.target as Node | null
          if (
            target instanceof Element &&
            target.closest("[data-sonner-toaster]")
          ) {
            event.preventDefault()
          }
        }}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
          {channel?.is_live ? (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">
                {channel.category_name ?? t("channel_row.no_category")} ·{" "}
                {t("channel_row.viewers_count", {
                  count: formatViewerCount(channel.viewer_count ?? 0),
                })}
              </p>
              {liveCategory &&
                (isNotifyingForCategory ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled
                    className="shrink-0 gap-1.5"
                  >
                    <BellCheckIcon />
                    {t("channel_detail.notifying_for_category")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="shrink-0 cursor-pointer gap-1.5"
                    disabled={addPreference.isPending}
                    onClick={handleNotifyForCategory}
                  >
                    <BellIcon />
                    {t("channel_preferences.notify_for_category")}
                  </Button>
                ))}
            </div>
          ) : (
            channel && (
              <p className="text-xs text-muted-foreground">
                {t("channel_row.offline")}
              </p>
            )
          )}
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          <ChannelThumbnail
            key={channel?.broadcaster_user_id ?? "none"}
            thumbnailUrl={channel?.thumbnail_url ?? null}
          />

          {channel?.is_live && channel.title && (
            <p className="text-sm font-medium">{channel.title}</p>
          )}

          {channel && (
            <div className="flex flex-col gap-2 sm:mx-auto sm:flex-row sm:justify-center">
              {liveCategory &&
                (snoozeNotification.isSuccess ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled
                    className="w-full gap-1.5 sm:w-fit sm:max-w-xs"
                  >
                    <AlarmClockCheckIcon />
                    {t("channel_detail.snooze_done")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={snoozeNotification.isPending}
                    className="w-full cursor-pointer gap-1.5 sm:w-fit sm:max-w-xs"
                    onClick={() =>
                      snoozeNotification.mutate({
                        broadcasterUserId: channel.broadcaster_user_id,
                        categoryId: liveCategory.id,
                      })
                    }
                  >
                    <AlarmClockIcon />
                    {t("channel_detail.snooze_action")}
                  </Button>
                ))}

              <Button
                size="lg"
                asChild
                className="w-full cursor-pointer sm:w-fit sm:max-w-xs"
              >
                <a
                  href={`https://twitch.tv/${channel.broadcaster_login}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("channel_detail.watch_on_twitch")}
                  <ExternalLinkIcon data-icon="inline-end" />
                </a>
              </Button>
            </div>
          )}

          {snoozeNotification.isError && (
            <p className="text-center text-xs text-destructive">
              {t("channel_detail.snooze_error")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
