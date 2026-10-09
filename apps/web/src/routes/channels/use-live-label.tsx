import type { ReactNode } from "react"
import { useLanguage } from "@/context/language-context"
import { formatLiveDuration } from "@/lib/format"
import { interpolateNodes } from "@/lib/i18n-react"
import type { FollowedChannel } from "@/types/channel"

function Emphasis({ children }: { children: ReactNode }) {
  return <span className="font-medium">{children}</span>
}

/**
 * Second line of a live channel (row and detail modal). `category_started_at`
 * is exact or null (issue #120): null falls back to the stream uptime,
 * labelled as such. The category and the time in it are emphasized; the stream
 * uptime stays regular.
 */
export function useLiveLabel(channel: FollowedChannel | null): ReactNode {
  const { t, tRaw } = useLanguage()
  if (!channel) return ""
  const category = (
    <Emphasis>{channel.category_name ?? t("channel_row.no_category")}</Emphasis>
  )
  if (!channel.started_at) return category
  const streamDuration = formatLiveDuration(channel.started_at)
  if (!channel.category_started_at) {
    return interpolateNodes(tRaw("channel_row.live_in_category_unknown"), {
      category,
      duration: streamDuration,
    })
  }
  if (
    new Date(channel.category_started_at).getTime() ===
    new Date(channel.started_at).getTime()
  ) {
    return interpolateNodes(tRaw("channel_row.live_for"), {
      category,
      duration: <Emphasis>{streamDuration}</Emphasis>,
    })
  }
  return interpolateNodes(tRaw("channel_row.live_for_category"), {
    category,
    categoryDuration: (
      <Emphasis>{formatLiveDuration(channel.category_started_at)}</Emphasis>
    ),
    streamDuration,
  })
}
