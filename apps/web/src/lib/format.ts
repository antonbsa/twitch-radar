function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "")
}

export function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${trimDecimal(count / 1_000_000)}M`
  if (count >= 1_000) return `${trimDecimal(count / 1_000)}K`
  return String(count)
}

export function formatLiveDuration(startedAt: string): string {
  const startedMs = new Date(startedAt).getTime()
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.now() - startedMs) / 60_000),
  )
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** Localized "5 minutes ago" / "3 hours ago" / "2 days ago": the coarsest whole unit since `isoTime`. */
export function formatTimeAgo(isoTime: string, locale: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoTime).getTime()) / 60_000),
  )
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" })
  if (minutes < 60) return rtf.format(-minutes, "minute")
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, "hour")
  return rtf.format(-Math.floor(hours / 24), "day")
}
