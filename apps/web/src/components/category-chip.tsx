import { useEffect, useRef, useState } from "react"
import { Globe, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// How long an armed (unconfirmed) removal stays highlighted before silently
// resetting, so a chip never gets stuck waiting for a second click.
const CONFIRM_RESET_MS = 3000

interface CategoryChipProps {
  label: string
  /**
   * Marks a per-channel preference whose category an active global preference
   * also covers. The chip stays removable — it is a real per-channel
   * preference that outlives the global one.
   */
  alsoGlobal?: boolean
  onRemove: () => void
  removeLabel: string
}

export function CategoryChip({
  label,
  alsoGlobal = false,
  onRemove,
  removeLabel,
}: CategoryChipProps) {
  const [confirming, setConfirming] = useState(false)
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    }
  }, [])

  function handleClick() {
    if (confirming) {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
      onRemove()
      return
    }
    setConfirming(true)
    resetTimeoutRef.current = setTimeout(
      () => setConfirming(false),
      CONFIRM_RESET_MS,
    )
  }

  return (
    <Badge
      asChild
      variant={alsoGlobal ? "outline" : "secondary"}
      className={cn(
        "h-6 cursor-pointer gap-1.5 px-2.5",
        alsoGlobal && "border-dashed",
        confirming
          ? "border-destructive text-destructive"
          : alsoGlobal && "border-primary/60",
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={removeLabel}
        data-confirming={confirming || undefined}
      >
        {alsoGlobal && (
          <Globe aria-hidden="true" className="size-3 text-primary" />
        )}
        {label}
        <X aria-hidden="true" className="size-3" />
      </button>
    </Badge>
  )
}
