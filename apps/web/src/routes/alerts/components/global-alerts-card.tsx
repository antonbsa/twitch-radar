import { Ban, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddCategoryChip } from "@/components/categories/add-category-chip"
import { CategoryChip } from "@/components/categories/category-chip"
import { useLanguage } from "@/context/language-context"
import type { GlobalPreference } from "@/types/preference"

interface GlobalAlertsCardProps {
  preferences: GlobalPreference[]
  onAdd: () => void
  onRemove: (preference: GlobalPreference) => void
  onEditExclusions: (preference: GlobalPreference) => void
  armedChipId: string | null
  onArmChip: (preferenceId: string) => void
}

export function GlobalAlertsCard({
  preferences,
  onAdd,
  onRemove,
  onEditExclusions,
  armedChipId,
  onArmChip,
}: GlobalAlertsCardProps) {
  const { t } = useLanguage()

  return (
    <div className="mx-4 rounded-lg border border-primary/40 bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/20">
          <Globe className="size-3.5 text-primary" />
        </span>
        <p className="flex-1 text-sm font-medium">
          {t("alerts.all_channels_subtitle")}
        </p>
      </div>

      {preferences.length === 0 && (
        <p className="px-3 pb-1 text-sm text-muted-foreground">
          {t("alerts.empty")}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        {preferences.map((pref) => (
          <div key={pref.id} className="flex items-center gap-0.5">
            <CategoryChip
              label={pref.category_name}
              armed={armedChipId === pref.id}
              onArm={() => onArmChip(pref.id)}
              onRemove={() => onRemove(pref)}
              removeLabel={t("alerts.remove_aria", {
                category: pref.category_name,
              })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onEditExclusions(pref)}
              aria-label={t("exclusions.open_aria", {
                category: pref.category_name,
              })}
              className="relative"
            >
              <Ban className="size-3.5" />
              {pref.exclusions.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                  {pref.exclusions.length}
                </span>
              )}
            </Button>
          </div>
        ))}
        <AddCategoryChip
          onClick={onAdd}
          label={t("alerts.add_global_category_aria")}
          visibleLabel={t("alerts.add_category")}
        />
      </div>
    </div>
  )
}
