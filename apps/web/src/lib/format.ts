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
