import { useMemo, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { FollowedChannel } from "@/types/channel"

interface AddChannelSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: FollowedChannel[]
  onSelect: (channel: FollowedChannel) => void
}

export function AddChannelSheet({
  open,
  onOpenChange,
  channels,
  onSelect,
}: AddChannelSheetProps) {
  const [query, setQuery] = useState("")

  // Channels that already have a card are deliberately not filtered out:
  // picking one opens its sheet, the same result as tapping its own "+".
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle
      ? channels.filter((channel) =>
          channel.broadcaster_display_name.toLowerCase().includes(needle),
        )
      : channels
    return [...list].sort((a, b) =>
      a.broadcaster_display_name.localeCompare(
        b.broadcaster_display_name,
        undefined,
        { sensitivity: "base" },
      ),
    )
  }, [channels, query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>Add channel</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 overflow-y-auto px-4 pb-4">
          <Input
            placeholder="Search channels..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          {matches.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              No channels found.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {matches.map((channel) => (
                <li key={channel.broadcaster_user_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(channel)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Avatar size="sm">
                      <AvatarImage
                        src={channel.broadcaster_profile_image_url ?? undefined}
                        alt=""
                      />
                      <AvatarFallback>
                        {channel.broadcaster_display_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {channel.broadcaster_display_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
