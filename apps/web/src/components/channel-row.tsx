import { Settings } from "lucide-react"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatLiveDuration, formatViewerCount } from "@/lib/format"
import type { FollowedChannel } from "@/types/channel"

interface ChannelRowProps {
  channel: FollowedChannel
  onConfigure: (channel: FollowedChannel) => void
}

export function ChannelRow({ channel, onConfigure }: ChannelRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
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
              {channel.category_name ?? "No category"} ·{" "}
              {formatViewerCount(channel.viewer_count ?? 0)} viewers
            </p>
            {channel.started_at && (
              <p className="truncate text-xs text-muted-foreground">
                In {channel.category_name ?? "category"} for{" "}
                {formatLiveDuration(channel.started_at)}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Offline</p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onConfigure(channel)}
        aria-label={`Configure ${channel.broadcaster_display_name}`}
      >
        <Settings className="size-4" />
      </Button>
    </div>
  )
}
