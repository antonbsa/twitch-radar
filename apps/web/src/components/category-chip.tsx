import { Globe, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface CategoryChipProps {
  label: string
  /**
   * Marks a per-channel preference whose category an active global preference
   * also covers. The chip stays removable — it is a real per-channel
   * preference that outlives the global one.
   */
  alsoGlobal?: boolean
  /** Whether this chip is the one currently armed for click-to-confirm removal. */
  armed: boolean
  /** Arms this chip. The owner clears any other armed chip first. */
  onArm: () => void
  onRemove: () => void
  removeLabel: string
}

export function CategoryChip({
  label,
  alsoGlobal = false,
  armed,
  onArm,
  onRemove,
  removeLabel,
}: CategoryChipProps) {
  function handleClick() {
    if (armed) {
      onRemove()
      return
    }
    onArm()
  }

  return (
    <Badge
      asChild
      variant={alsoGlobal ? "outline" : "secondary"}
      className={cn(
        "h-8 cursor-pointer gap-1.5 px-2.5",
        alsoGlobal && "border-dashed",
        armed
          ? "border-destructive text-destructive"
          : alsoGlobal && "border-primary/60",
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={removeLabel}
        data-confirming={armed || undefined}
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
