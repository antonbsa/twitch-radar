import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { AddChannelDialog } from "@/routes/alerts/components/add-channel-dialog"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import {
  useBroadcasterMutes,
  useMuteBroadcaster,
  useUnmuteBroadcaster,
} from "@/hooks/use-notifications"
import type { FollowedChannel } from "@/types/channel"

interface MutedChannelsSectionProps {
  channels: FollowedChannel[]
}

/** Alerts-page list of active broadcaster mutes, each with an unmute action. */
export function MutedChannelsSection({ channels }: MutedChannelsSectionProps) {
  const { t } = useLanguage()
  const { data: mutes } = useBroadcasterMutes()
  const unmute = useUnmuteBroadcaster()
  const mute = useMuteBroadcaster()
  const [addOpen, setAddOpen] = useState(false)
  const mutedIds = new Set((mutes ?? []).map((m) => m.broadcaster_user_id))

  // An unfollowed broadcaster's mute stays until the user removes it, so fall
  // back to the raw id when the channel is no longer in the followed list.
  const nameFor = (broadcasterUserId: string) =>
    channels.find((c) => c.broadcaster_user_id === broadcasterUserId)
      ?.broadcaster_display_name ?? broadcasterUserId

  return (
    <section data-testid="muted-channels">
      <div className="flex items-center justify-between gap-2 px-4 pt-6 pb-2">
        <h2 className="text-base font-semibold text-muted-foreground">
          {t("alerts.muted_title")}
        </h2>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setAddOpen(true)}
          aria-label={t("alerts.mute_add_aria")}
          className="h-11 w-11 shrink-0"
        >
          <PlusIcon className="size-5" />
        </Button>
      </div>
      {(mutes ?? []).length === 0 ? (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          {t("alerts.muted_empty")}
        </p>
      ) : (
        <ul className="mx-4 divide-y divide-border rounded-lg border border-border bg-card">
          {(mutes ?? []).map((m) => {
            const name = nameFor(m.broadcaster_user_id)
            return (
              <li
                key={m.id}
                data-broadcaster-user-id={m.broadcaster_user_id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="truncate text-sm font-medium">{name}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={unmute.isPending}
                  aria-label={t("alerts.unmute_aria", { channel: name })}
                  onClick={() =>
                    unmute.mutate(m.id, {
                      onSuccess: () =>
                        toast(t("mute.unmuted_toast", { channel: name })),
                    })
                  }
                >
                  {t("alerts.unmute")}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <AddChannelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t("mute.add_title")}
        channels={channels.filter((c) => !mutedIds.has(c.broadcaster_user_id))}
        onSelect={(channel) => {
          setAddOpen(false)
          mute.mutate(channel.broadcaster_user_id, {
            onSuccess: () =>
              toast(
                t("mute.muted_toast", {
                  channel: channel.broadcaster_display_name,
                }),
              ),
          })
        }}
      />
    </section>
  )
}
