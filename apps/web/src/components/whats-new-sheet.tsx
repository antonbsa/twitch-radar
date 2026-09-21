import { changelog } from "virtual:changelog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLanguage } from "@/context/language-context"
import { renderInlineCode } from "@/lib/inline-code"
import type { ChangelogVersion } from "@/lib/changelog-parser"

// The badge/list only ever show the last 3 released versions (issue #63) —
// engineer-facing categories (Migrations & Config, Docs & Decisions, Other
// Changes) never render here.
const MAX_VERSIONS_SHOWN = 3

interface WhatsNewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhatsNewSheet({ open, onOpenChange }: WhatsNewSheetProps) {
  const { t, language } = useLanguage()
  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeZone: "UTC",
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{t("whats_new.title")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4 pb-4">
          {changelog.slice(0, MAX_VERSIONS_SHOWN).map((version) => (
            <VersionEntry
              key={version.version}
              version={version}
              dateLabel={dateFormatter.format(new Date(version.date))}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function VersionEntry({
  version,
  dateLabel,
}: {
  version: ChangelogVersion
  dateLabel: string
}) {
  const { t } = useLanguage()
  const { features, fixes } = version.categories

  return (
    <div>
      <p className="text-sm font-medium">
        {t("whats_new.version_heading", {
          version: version.version,
          date: dateLabel,
        })}
      </p>
      {features.length === 0 && fixes.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("whats_new.no_user_facing_changes")}
        </p>
      ) : (
        <div className="mt-1 space-y-2">
          <CategoryList
            heading={t("whats_new.features_heading")}
            items={features}
          />
          <CategoryList heading={t("whats_new.fixes_heading")} items={fixes} />
        </div>
      )}
    </div>
  )
}

function CategoryList({
  heading,
  items,
}: {
  heading: string
  items: string[]
}) {
  if (items.length === 0) return null

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{heading}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
        {items.map((item, index) => (
          <li key={index}>{renderInlineCode(item)}</li>
        ))}
      </ul>
    </div>
  )
}
