import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import {
  useBroadcasterMutes,
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

  // An unfollowed broadcaster's mute stays until the user removes it, so fall
  // back to the raw id when the channel is no longer in the followed list.
  const nameFor = (broadcasterUserId: string) =>
    channels.find((c) => c.broadcaster_user_id === broadcasterUserId)
      ?.broadcaster_display_name ?? broadcasterUserId

  return (
    <section data-testid="muted-channels">
      <h2 className="px-4 pt-6 pb-2 text-base font-semibold text-muted-foreground">
        {t("alerts.muted_title")}
      </h2>
      {(mutes ?? []).length === 0 ? (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          {t("alerts.muted_empty")}
        </p>
      ) : (
        <ul className="mx-4 divide-y divide-border rounded-lg border border-border bg-card">
          {(mutes ?? []).map((mute) => {
            const name = nameFor(mute.broadcaster_user_id)
            return (
              <li
                key={mute.id}
                data-broadcaster-user-id={mute.broadcaster_user_id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="truncate text-sm font-medium">{name}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={unmute.isPending}
                  aria-label={t("alerts.unmute_aria", { channel: name })}
                  onClick={() => unmute.mutate(mute.id)}
                >
                  {t("alerts.unmute")}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
