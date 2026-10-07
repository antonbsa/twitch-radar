/** Rendered box art size (Twitch's 3:4 poster ratio). */
export const BOX_ART_WIDTH = 40
export const BOX_ART_HEIGHT = 54

/** Twitch returns box art as a template with `{width}x{height}` placeholders. */
export function boxArtSrc(
  template: string,
  width = BOX_ART_WIDTH,
  height = BOX_ART_HEIGHT,
): string {
  return template
    .replace("{width}", String(width))
    .replace("{height}", String(height))
}
