import { useMemo, useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { SearchField } from "@/components/search-field"
import { useLanguage } from "@/context/language-context"
import {
  useAddGlobalPreferenceExclusion,
  useRemoveGlobalPreferenceExclusion,
} from "@/hooks/use-preferences"
import type { FollowedChannel } from "@/types/channel"
import type { GlobalPreference } from "@/types/preference"

interface GlobalExclusionsDialogProps {
  /** The global preference being edited; the dialog is open while it is set. */
  preference: GlobalPreference | null
  onOpenChange: (open: boolean) => void
  channels: FollowedChannel[]
}

function ChannelAvatar({ channel }: { channel: FollowedChannel }) {
  return (
    <Avatar size="sm">
      <AvatarImage
        src={channel.broadcaster_profile_image_url ?? undefined}
        alt=""
      />
      <AvatarFallback>
        {channel.broadcaster_display_name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Lists a global preference's excluded channels (each removable) and adds one
 * from the followed channels (ADR 0054). An exclusion for a broadcaster the
 * user no longer follows stays stored but is not listed here.
 */
export function GlobalExclusionsDialog({
  preference,
  onOpenChange,
  channels,
}: GlobalExclusionsDialogProps) {
  const [query, setQuery] = useState("")
  const { t } = useLanguage()
  const addExclusion = useAddGlobalPreferenceExclusion()
  const removeExclusion = useRemoveGlobalPreferenceExclusion()

  const { excluded, candidates } = useMemo(() => {
    const exclusionByBroadcaster = new Map(
      (preference?.exclusions ?? []).map((e) => [e.broadcaster_user_id, e]),
    )
    const byName = (a: FollowedChannel, b: FollowedChannel) =>
      a.broadcaster_display_name.localeCompare(
        b.broadcaster_display_name,
        undefined,
        { sensitivity: "base" },
      )
    const needle = query.trim().toLowerCase()
    return {
      excluded: channels
        .filter((c) => exclusionByBroadcaster.has(c.broadcaster_user_id))
        .sort(byName)
        .map((channel) => ({
          channel,
          exclusionId: exclusionByBroadcaster.get(channel.broadcaster_user_id)!
            .id,
        })),
      candidates: channels
        .filter(
          (c) =>
            !exclusionByBroadcaster.has(c.broadcaster_user_id) &&
            c.broadcaster_display_name.toLowerCase().includes(needle),
        )
        .sort(byName),
    }
  }, [channels, preference?.exclusions, query])

  return (
    <Dialog
      open={preference !== null}
      onOpenChange={(open) => {
        if (!open) setQuery("")
        onOpenChange(open)
      }}
    >
      <DialogContent fullScreen data-testid="exclusions-dialog">
        <DialogHeader className="min-h-14 justify-center px-4 py-3 pr-14">
          <DialogTitle>
            {t("exclusions.title", {
              category: preference?.category_name ?? "",
            })}
          </DialogTitle>
          <DialogDescription>{t("exclusions.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <section>
            <h3 className="pb-2 text-sm font-semibold text-muted-foreground">
              {t("exclusions.excluded_title")}
            </h3>
            {excluded.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("exclusions.empty")}
              </p>
            ) : (
              <ul
                data-testid="excluded-channels"
                className="rounded-lg border border-border"
              >
                {excluded.map(({ channel, exclusionId }) => (
                  <li key={channel.broadcaster_user_id}>
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={removeExclusion.isPending}
                      aria-label={t("exclusions.remove_aria", {
                        channel: channel.broadcaster_display_name,
                      })}
                      onClick={() =>
                        preference &&
                        removeExclusion.mutate({
                          preferenceId: preference.id,
                          exclusionId,
                        })
                      }
                      className="h-auto min-h-11 w-full justify-start gap-2 rounded-none px-3 py-2 text-left"
                    >
                      <ChannelAvatar channel={channel} />
                      <span className="flex-1 truncate">
                        {channel.broadcaster_display_name}
                      </span>
                      <XIcon className="size-4 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t("exclusions.add_title")}
            </h3>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t("alerts.channel_search_placeholder")}
              ariaLabel={t("alerts.channel_picker_search_aria")}
              clearLabel={t("alerts.clear_channel_search_aria")}
            />
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("alerts.no_channels_found")}
              </p>
            ) : (
              <ul className="rounded-lg border border-border">
                {candidates.map((channel) => (
                  <li key={channel.broadcaster_user_id}>
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={addExclusion.isPending}
                      aria-label={t("exclusions.add_aria", {
                        channel: channel.broadcaster_display_name,
                      })}
                      onClick={() =>
                        preference &&
                        addExclusion.mutate({
                          preferenceId: preference.id,
                          broadcasterUserId: channel.broadcaster_user_id,
                        })
                      }
                      className="h-auto min-h-11 w-full justify-start gap-2 rounded-none px-3 py-2 text-left"
                    >
                      <ChannelAvatar channel={channel} />
                      <span className="flex-1 truncate">
                        {channel.broadcaster_display_name}
                      </span>
                      <PlusIcon className="size-4 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
