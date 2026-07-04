import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CategorySearchList } from "@/components/category-search-list"
import {
  useAddChannelPreference,
  usePreferences,
  useRemoveChannelPreference,
} from "@/hooks/use-preferences"
import type { FollowedChannel } from "@/types/channel"

interface ChannelPreferencesSheetProps {
  channel: FollowedChannel | null
  onOpenChange: (open: boolean) => void
}

export function ChannelPreferencesSheet({
  channel,
  onOpenChange,
}: ChannelPreferencesSheetProps) {
  const { data: preferences, isLoading } = usePreferences()
  const addPreference = useAddChannelPreference()
  const removePreference = useRemoveChannelPreference()

  const savedForChannel = channel
    ? (preferences?.channel ?? []).filter(
        (pref) => pref.broadcaster_user_id === channel.broadcaster_user_id,
      )
    : []

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{channel?.broadcaster_display_name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          <CategorySearchList
            disabledCategoryIds={savedForChannel.map(
              (pref) => pref.category_id,
            )}
            onSelect={(category) => {
              if (!channel) return
              addPreference.mutate({
                broadcasterUserId: channel.broadcaster_user_id,
                category,
              })
            }}
          />

          <div>
            <p className="text-sm font-medium">Saved for this channel</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-6 w-24" />
            ) : savedForChannel.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No preferences saved.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {savedForChannel.map((pref) => (
                  <Badge key={pref.id} variant="secondary" className="gap-1">
                    {pref.category_name}
                    <button
                      type="button"
                      onClick={() => removePreference.mutate(pref.id)}
                      aria-label={`Remove ${pref.category_name}`}
                    >
                      ✕
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
