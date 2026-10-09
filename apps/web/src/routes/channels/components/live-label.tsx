import { useLanguage } from "@/context/language-context"
import { formatLiveDuration } from "@/lib/format"
import type { FollowedChannel } from "@/types/channel"

/**
 * Second line of a live channel (row and detail modal): the category part
 * ("In X for 40m") then, after a divider, the stream uptime ("live 2h 20m").
 * `category_started_at` is exact or null (issue #120): null drops the
 * category time, and equal to `started_at` drops the uptime part since the
 * two durations coincide.
 */
export function LiveLabel({ channel }: { channel: FollowedChannel }) {
  const { t } = useLanguage()
  const category = channel.category_name ?? t("channel_row.no_category")
  if (!channel.started_at) return category

  const streamDuration = formatLiveDuration(channel.started_at)
  const categoryStartedAt = channel.category_started_at
  const sameStart =
    categoryStartedAt !== null &&
    new Date(categoryStartedAt).getTime() ===
      new Date(channel.started_at).getTime()

  const categoryPart = categoryStartedAt
    ? t("channel_row.live_for", {
        category,
        duration: formatLiveDuration(categoryStartedAt),
      })
    : t("channel_row.live_in_category", { category })
  if (sameStart) return categoryPart

  return (
    <>
      {categoryPart}{" "}
      <span
        aria-hidden="true"
        className="mx-1 inline-block h-3 w-0.5 rounded-full bg-muted-foreground/50 align-middle"
      />{" "}
      {t("channel_row.live_duration", { duration: streamDuration })}
    </>
  )
}
