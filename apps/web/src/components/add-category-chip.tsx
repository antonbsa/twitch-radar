import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface AddCategoryChipProps {
  onClick: () => void
  label: string
  /**
   * Visible text next to the icon. Omit for an icon-only chip (e.g. one
   * repeated per channel card, where a repeated label would be noisy).
   */
  visibleLabel?: string
}

/**
 * A dashed "add" chip that sits at the end of a category list, styled like
 * the categories around it rather than as a separate header control.
 */
export function AddCategoryChip({
  onClick,
  label,
  visibleLabel,
}: AddCategoryChipProps) {
  return (
    <Badge
      asChild
      variant="outline"
      className="h-6 cursor-pointer border-dashed px-2.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
    >
      <button type="button" onClick={onClick} aria-label={label}>
        <Plus aria-hidden="true" className="size-3" />
        {visibleLabel}
      </button>
    </Badge>
  )
}
