import { Skeleton } from "@/components/ui/skeleton"

interface ChannelRowSkeletonProps {
  /** A live row carries two metadata lines (category · viewers, live for), an offline row one. */
  variant: "live" | "offline"
}

/**
 * Loading placeholder that keeps `ChannelRow`'s box model (padding, avatar
 * size, line heights, action button) so the loaded row lands without a shift.
 */
export function ChannelRowSkeleton({ variant }: ChannelRowSkeletonProps) {
  return (
    <div
      data-testid="channel-row-skeleton"
      aria-hidden
      className="flex items-center gap-3 px-4 py-2.5"
    >
      <Skeleton className="size-8 shrink-0 rounded-full" />

      {/* Each bar sits in a wrapper with the real text's line height (text-sm 20px, text-xs 16px). */}
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-44" />
        </div>
        {variant === "live" && (
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-36" />
          </div>
        )}
      </div>

      <Skeleton className="size-7 shrink-0" />
    </div>
  )
}
