import { useState } from "react"
import { BOX_ART_HEIGHT, BOX_ART_WIDTH, boxArtSrc } from "@/lib/box-art"
import { cn } from "@/lib/utils"

interface CategoryBoxArtProps {
  boxArtUrl?: string | null
  /** First letter is shown in the placeholder when there is no image. */
  name: string
  className?: string
}

/**
 * Category poster at a fixed size, shared by every place a category name is
 * shown. A missing or failed image falls back to a placeholder box, like
 * ChannelRow's AvatarFallback.
 */
export function CategoryBoxArt({
  boxArtUrl,
  name,
  className,
}: CategoryBoxArtProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = boxArtUrl && failedUrl !== boxArtUrl

  return (
    <span
      data-slot="category-box-art"
      style={{ width: BOX_ART_WIDTH, height: BOX_ART_HEIGHT }}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-xs text-muted-foreground",
        className,
      )}
    >
      {showImage ? (
        <img
          src={boxArtSrc(boxArtUrl)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedUrl(boxArtUrl)}
        />
      ) : (
        <span aria-hidden="true">{name[0]?.toUpperCase()}</span>
      )}
    </span>
  )
}
