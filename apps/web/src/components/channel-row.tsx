import { Settings } from "lucide-react"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import { cn } from "@/lib/utils"
import { formatLiveDuration, formatViewerCount } from "@/lib/format"
import type { FollowedChannel } from "@/types/channel"

interface ChannelRowProps {
  channel: FollowedChannel
  onConfigure: (channel: FollowedChannel) => void
  onOpenDetail: (channel: FollowedChannel) => void
}

export function ChannelRow({
  channel,
  onConfigure,
  onOpenDetail,
}: ChannelRowProps) {
  const { t } = useLanguage()
  return (
    <div
      data-testid="channel-row"
      data-broadcaster-user-id={channel.broadcaster_user_id}
      onClick={() => onOpenDetail(channel)}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted",
        !channel.is_live && "opacity-60",
      )}
    >
      <Avatar>
        <AvatarImage
          src={channel.broadcaster_profile_image_url ?? undefined}
          alt=""
        />
        <AvatarFallback>
          {channel.broadcaster_display_name[0]?.toUpperCase()}
        </AvatarFallback>
        {channel.is_live && <AvatarBadge className="bg-red-500" />}
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {channel.broadcaster_display_name}
        </p>
        {channel.is_live ? (
          <>
            <p className="truncate text-xs text-muted-foreground">
              {channel.category_name ?? t("channel_row.no_category")} ·{" "}
              {t("channel_row.viewers_count", {
                count: formatViewerCount(channel.viewer_count ?? 0),
              })}
            </p>
            {channel.started_at && (
              <p className="truncate text-xs text-muted-foreground">
                {t("channel_row.live_for", {
                  category:
                    channel.category_name ?? t("channel_row.no_category"),
                  duration: formatLiveDuration(channel.started_at),
                })}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("channel_row.offline")}
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation()
          onConfigure(channel)
        }}
        aria-label={t("channel_row.configure_aria", {
          name: channel.broadcaster_display_name,
        })}
      >
        <Settings className="size-4" />
      </Button>
    </div>
  )
}
