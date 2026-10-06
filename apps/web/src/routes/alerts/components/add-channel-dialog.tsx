import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SearchField } from "@/components/search-field"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLanguage } from "@/context/language-context"
import type { FollowedChannel } from "@/types/channel"

interface AddChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: FollowedChannel[]
  onSelect: (channel: FollowedChannel) => void
  /** Overrides the default "Add channel" heading. */
  title?: string
}

export function AddChannelDialog({
  open,
  onOpenChange,
  channels,
  onSelect,
  title,
}: AddChannelDialogProps) {
  const [query, setQuery] = useState("")
  const { t } = useLanguage()

  // Channels that already have a card are deliberately not filtered out:
  // picking one opens its preferences dialog, the same result as tapping its own "+".
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader className="h-14 justify-center px-4 pr-14">
          <DialogTitle>{title ?? t("alerts.add_channel")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t("alerts.channel_search_placeholder")}
            ariaLabel={t("alerts.channel_picker_search_aria")}
            clearLabel={t("alerts.clear_channel_search_aria")}
            autoFocus
          />

          {matches.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              {t("alerts.no_channels_found")}
            </p>
          ) : (
            <ul className="rounded-lg border border-border">
              {matches.map((channel) => (
                <li key={channel.broadcaster_user_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(channel)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
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
      </DialogContent>
    </Dialog>
  )
}
