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
  onRemove: () => void
  removeLabel: string
}

export function CategoryChip({
  label,
  alsoGlobal = false,
  onRemove,
  removeLabel,
}: CategoryChipProps) {
  return (
    <Badge
      variant={alsoGlobal ? "outline" : "secondary"}
      className={cn("gap-1", alsoGlobal && "border-dashed border-primary/60")}
    >
      {alsoGlobal && <Globe aria-hidden="true" className="text-primary" />}
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="text-muted-foreground hover:text-foreground"
      >
        <X />
      </button>
    </Badge>
  )
}
