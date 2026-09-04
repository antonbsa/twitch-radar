import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { formatViewerCount } from "@/lib/format"
import type { FollowedChannel } from "@/types/channel"

interface ChannelDetailModalProps {
  channel: FollowedChannel | null
  onOpenChange: (open: boolean) => void
}

export function ChannelDetailModal({
  channel,
  onOpenChange,
}: ChannelDetailModalProps) {
  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh]"
        data-testid="channel-detail-modal"
        data-broadcaster-user-id={channel?.broadcaster_user_id}
      >
        <SheetHeader>
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          {channel?.thumbnail_url ? (
            <img
              src={channel.thumbnail_url}
              alt=""
              className="aspect-video w-full rounded-md object-cover"
            />
          ) : (
            <div className="aspect-video w-full rounded-md bg-muted" />
          )}

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
            <Button size="lg" asChild className="w-full">
              <a
                href={`https://twitch.tv/${channel.broadcaster_login}`}
                target="_blank"
                rel="noreferrer"
              >
                Watch on Twitch
              </a>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
