/**
 * Rendered box art sizes (Twitch's 3:4 poster ratio): `md` for list rows,
 * `sm` for chips and the line next to a title (ADR 0058).
 */
export const BOX_ART_SIZES = {
  md: { width: 40, height: 54 },
  sm: { width: 18, height: 24 },
} as const

export type BoxArtSize = keyof typeof BOX_ART_SIZES

/** Twitch returns box art as a template with `{width}x{height}` placeholders. */
export function boxArtSrc(template: string, size: BoxArtSize = "md"): string {
  const { width, height } = BOX_ART_SIZES[size]
  return template
    .replace("{width}", String(width))
    .replace("{height}", String(height))
}
