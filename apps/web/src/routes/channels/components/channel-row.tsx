import { BellOffIcon, Globe, Settings } from "lucide-react"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import { cn } from "@/lib/utils"
import { formatTimeAgo, formatViewerCount } from "@/lib/format"
import { useLiveLabel } from "@/routes/channels/use-live-label"
import type { FollowedChannel } from "@/types/channel"

interface ChannelRowProps {
  channel: FollowedChannel
  onConfigure: (channel: FollowedChannel) => void
  onOpenDetail: (channel: FollowedChannel) => void
  /** Set when a live channel's category matches an active preference. */
  preferenceMatch?: "channel" | "global" | null
  /** The user muted this broadcaster (ADR 0054). */
  muted?: boolean
}

export function ChannelRow({
  channel,
  onConfigure,
  onOpenDetail,
  preferenceMatch = null,
  muted = false,
}: ChannelRowProps) {
  const { t, language } = useLanguage()
  const liveLabel = useLiveLabel(channel)

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
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">
            {channel.broadcaster_display_name}
          </p>
          {muted && (
            <BellOffIcon
              role="img"
              aria-label={t("channel_row.muted_aria")}
              data-testid="muted-indicator"
              className="size-3 shrink-0 self-center text-muted-foreground"
            />
          )}
          {channel.is_live && (
            <p className="shrink-0 text-xs text-muted-foreground">
              {t("channel_row.viewers_count", {
                count: formatViewerCount(channel.viewer_count ?? 0),
              })}
            </p>
          )}
        </div>
        {channel.is_live ? (
          <p
            data-preference-match={preferenceMatch ?? undefined}
            className={cn(
              "flex items-center gap-1 text-xs text-muted-foreground",
              preferenceMatch && "font-medium text-[#f09d22]",
            )}
          >
            {preferenceMatch === "global" && (
              <Globe aria-hidden="true" className="size-3 shrink-0" />
            )}
            <span className="truncate">{liveLabel}</span>
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {channel.last_live_at
              ? t("channel_row.last_live", {
                  category:
                    channel.last_category_name ?? t("channel_row.no_category"),
                  time: formatTimeAgo(channel.last_live_at, language),
                })
              : t("channel_row.offline")}
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
