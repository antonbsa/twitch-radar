import { useState } from "react"
import {
  AlarmClockCheckIcon,
  AlarmClockIcon,
  BellCheckIcon,
  BellIcon,
  BellOffIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ToggleActionButton } from "@/routes/channels/components/toggle-action-button"
import { useLanguage } from "@/context/language-context"
import {
  useBroadcasterMutes,
  useMuteBroadcaster,
  useUnmuteBroadcaster,
} from "@/hooks/use-notifications"
import { formatViewerCount } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FollowedChannel } from "@/types/channel"
import { getLiveCategory } from "@/routes/channels/live-category"
import { useChannelCategoryNotify } from "@/routes/channels/use-channel-category-notify"
import { LiveLabel } from "@/routes/channels/components/live-label"
import { useChannelSnooze } from "@/routes/channels/use-channel-snooze"

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
  const liveCategory = getLiveCategory(channel)
  const snoozeNotification = useChannelSnooze(channel, liveCategory)
  const notify = useChannelCategoryNotify(channel, liveCategory)
  const { data: mutes } = useBroadcasterMutes()
  const muteBroadcaster = useMuteBroadcaster()
  const unmuteBroadcaster = useUnmuteBroadcaster()
  const activeMute = (mutes ?? []).find(
    (mute) => mute.broadcaster_user_id === channel?.broadcaster_user_id,
  )

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
        <SheetHeader className="pr-14 pb-0">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarImage
                src={channel?.broadcaster_profile_image_url ?? undefined}
                alt=""
              />
              <AvatarFallback>
                {channel?.broadcaster_display_name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <SheetTitle className="truncate">
              {channel?.broadcaster_display_name}
            </SheetTitle>
            {activeMute && (
              <BellOffIcon
                role="img"
                aria-label={t("channel_row.muted_aria")}
                data-testid="muted-indicator"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            )}
            {channel?.is_live && (
              <p className="shrink-0 text-xs text-muted-foreground">
                {t("channel_row.viewers_count", {
                  count: formatViewerCount(channel.viewer_count ?? 0),
                })}
              </p>
            )}
          </div>
          {channel?.is_live ? (
            <div className="flex items-center gap-2">
              <p className="truncate text-xs text-muted-foreground">
                <LiveLabel channel={channel} />
              </p>
              {liveCategory && (
                <ToggleActionButton
                  isDone={notify.isNotifying}
                  isPending={notify.isPending}
                  idleIcon={<BellIcon />}
                  idleLabel={t("channel_detail.add_alert")}
                  idleAriaLabel={t("channel_detail.add_alert_aria", {
                    channel: channel.broadcaster_display_name,
                    category: liveCategory.name,
                  })}
                  doneIcon={<BellCheckIcon />}
                  doneLabel={t("channel_detail.alert_active")}
                  onClick={notify.notify}
                  className="shrink-0"
                />
              )}
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
            <div className="flex flex-col gap-2">
              <div className={cn("grid gap-2", liveCategory && "grid-cols-2")}>
                {liveCategory && (
                  <ToggleActionButton
                    isDone={snoozeNotification.isSnoozed}
                    isPending={snoozeNotification.isPending}
                    idleIcon={<AlarmClockIcon />}
                    idleLabel={t("channel_detail.snooze_action")}
                    doneIcon={<AlarmClockCheckIcon />}
                    doneLabel={t("channel_detail.snooze_done")}
                    onClick={snoozeNotification.snooze}
                  />
                )}

                {activeMute ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={unmuteBroadcaster.isPending}
                    onClick={() =>
                      unmuteBroadcaster.mutate(activeMute.id, {
                        onSuccess: () =>
                          toast(
                            t("mute.unmuted_toast", {
                              channel: channel.broadcaster_display_name,
                            }),
                          ),
                      })
                    }
                  >
                    <BellIcon />
                    {t("mute.unmute_action")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={muteBroadcaster.isPending}
                    onClick={() =>
                      muteBroadcaster.mutate(channel.broadcaster_user_id, {
                        onSuccess: () =>
                          toast(
                            t("mute.muted_toast", {
                              channel: channel.broadcaster_display_name,
                            }),
                          ),
                      })
                    }
                  >
                    <BellOffIcon />
                    {t("mute.mute_action")}
                  </Button>
                )}
              </div>

              <Button size="lg" asChild className="h-11 text-base">
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
