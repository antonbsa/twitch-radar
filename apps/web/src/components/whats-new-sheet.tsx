import { SparklesIcon, TrendingUpIcon, WrenchIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { changelog } from "virtual:changelog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLanguage } from "@/context/language-context"
import { renderInlineCode } from "@/lib/inline-code"
import type { ChangelogSection, ChangelogVersion } from "@/lib/changelog-parser"

const MAX_VERSIONS_SHOWN = 3

const SECTIONS: {
  key: ChangelogSection
  labelKey: string
  icon: LucideIcon
}[] = [
  { key: "new", labelKey: "whats_new.new_heading", icon: SparklesIcon },
  {
    key: "improved",
    labelKey: "whats_new.improved_heading",
    icon: TrendingUpIcon,
  },
  { key: "fixed", labelKey: "whats_new.fixed_heading", icon: WrenchIcon },
]

interface WhatsNewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhatsNewSheet({ open, onOpenChange }: WhatsNewSheetProps) {
  const { t, language } = useLanguage()
  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "long",
    timeZone: "UTC",
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] gap-0 data-[side=bottom]:sm:top-1/2 data-[side=bottom]:sm:bottom-auto data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-lg data-[side=bottom]:sm:-translate-y-1/2 data-[side=bottom]:sm:rounded-lg data-[side=bottom]:sm:border"
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t("whats_new.title")}</SheetTitle>
        </SheetHeader>
        <div className="divide-y overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
  const hasChanges = SECTIONS.some(
    ({ key }) => version.sections[key].length > 0,
  )

  return (
    <section className="py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{dateLabel}</h3>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {version.version}
        </span>
      </div>
      {version.summary && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {renderInlineCode(version.summary)}
        </p>
      )}
      {hasChanges ? (
        SECTIONS.map(({ key, labelKey, icon }) => (
          <SectionList
            key={key}
            label={t(labelKey)}
            icon={icon}
            items={version.sections[key]}
          />
        ))
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("whats_new.no_user_facing_changes")}
        </p>
      )}
    </section>
  )
}

function SectionList({
  label,
  icon: Icon,
  items,
}: {
  label: string
  icon: LucideIcon
  items: string[]
}) {
  if (items.length === 0) return null

  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.85em]">
        {items.map((item, index) => (
          <li key={index}>{renderInlineCode(item)}</li>
        ))}
      </ul>
    </div>
  )
}
