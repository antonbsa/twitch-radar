import { Globe } from "lucide-react"
import { AddCategoryChip } from "@/components/add-category-chip"
import { CategoryChip } from "@/components/category-chip"
import type { GlobalPreference } from "@/types/preference"

interface GlobalAlertsCardProps {
  preferences: GlobalPreference[]
  onAdd: () => void
  onRemove: (preferenceId: string) => void
}

export function GlobalAlertsCard({
  preferences,
  onAdd,
  onRemove,
}: GlobalAlertsCardProps) {
  return (
    <div className="mx-4 rounded-lg border border-primary/40 bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/20">
          <Globe className="size-3.5 text-primary" />
        </span>
        <p className="flex-1 text-sm font-medium">Applies to every channel</p>
      </div>

      {preferences.length === 0 && (
        <p className="px-3 pb-1 text-sm text-muted-foreground">
          No global alerts set.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        {preferences.map((pref) => (
          <CategoryChip
            key={pref.id}
            label={pref.category_name}
            onRemove={() => onRemove(pref.id)}
            removeLabel={`Remove ${pref.category_name}`}
          />
        ))}
        <AddCategoryChip onClick={onAdd} label="Add global category" />
      </div>
    </div>
  )
}
