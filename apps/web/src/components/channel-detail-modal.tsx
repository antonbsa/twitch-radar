import { useState } from "react"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { formatViewerCount } from "@/lib/format"
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
  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-lg border data-[side=bottom]:top-1/2 data-[side=bottom]:bottom-auto data-[side=bottom]:-translate-y-1/2 data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-136"
        data-testid="channel-detail-modal"
        data-broadcaster-user-id={channel?.broadcaster_user_id}
      >
        <SheetHeader>
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          <ChannelThumbnail
            key={channel?.broadcaster_user_id ?? "none"}
            thumbnailUrl={channel?.thumbnail_url ?? null}
          />

          {channel?.is_live ? (
            <div className="space-y-1">
              {channel.title && (
                <p className="text-sm font-medium">{channel.title}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {channel.category_name ?? "No category"} ·{" "}
                {formatViewerCount(channel.viewer_count ?? 0)} viewers
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Offline</p>
          )}

          {channel && (
            <Button
              size="lg"
              asChild
              className="w-full sm:mx-auto sm:flex sm:w-fit sm:max-w-xs"
            >
              <a
                href={`https://twitch.tv/${channel.broadcaster_login}`}
                target="_blank"
                rel="noreferrer"
              >
                Watch on Twitch
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
