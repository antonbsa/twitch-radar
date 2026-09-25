import {
  ArrowDown10,
  ArrowDownAZ,
  ChevronDownIcon,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/context/language-context"
import type { ChannelFilters, ChannelSort } from "@/lib/channel-filters"
import { cn } from "@/lib/utils"

// 44px touch-target height; responsive width (narrow on mobile, full label width at md+)
const CATEGORY_TRIGGER_CLASSNAME =
  "flex h-11 w-28 min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 text-base whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 sm:w-36 md:w-fit"

interface ChannelFiltersBarProps {
  filters: ChannelFilters
  onChange: (patch: Partial<ChannelFilters>) => void
  categories: string[]
}

export function ChannelFiltersBar({
  filters,
  onChange,
  categories,
}: ChannelFiltersBarProps) {
  const { t } = useLanguage()

  function toggleCategory(category: string) {
    const next = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category]
    onChange({ categories: next })
  }

  const categorySummary =
    filters.categories.length === 0
      ? t("channels.all_categories")
      : filters.categories.length === 1
        ? filters.categories[0]
        : t("channels.categories_selected_count", {
            count: String(filters.categories.length),
          })

  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder={t("channels.search_placeholder")}
          aria-label={t("channels.search_aria")}
          // h-11/text-base matches SelectTrigger's "lg" size (see
          // CATEGORY_TRIGGER_CLASSNAME above) for the 44px touch target.
          className="h-11 pr-10 pl-10 text-base"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange({ search: "" })}
          aria-label={t("channels.clear_search_aria")}
          // inset-y-0 + my-auto centers without translate, avoiding conflicts
          // with Button's active:translate-y-px press effect. visibility
          // toggles discrete state so transitions feel smooth and the button
          // becomes non-interactive when hidden.
          className={cn(
            "absolute inset-y-0 right-1.5 my-auto transition-[opacity,visibility] duration-250",
            filters.search.length > 0
              ? "visible opacity-100"
              : "invisible opacity-0",
          )}
        >
          <X />
        </Button>
      </div>

      {categories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={CATEGORY_TRIGGER_CLASSNAME}
            aria-label={t("channels.category_filter_aria")}
          >
            <span className="min-w-0 truncate">{categorySummary}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={filters.categories.length === 0}
              onCheckedChange={() => onChange({ categories: [] })}
              onSelect={(e) => e.preventDefault()}
            >
              {t("channels.all_categories")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {categories.map((category) => (
              <DropdownMenuCheckboxItem
                key={category}
                checked={filters.categories.includes(category)}
                onCheckedChange={() => toggleCategory(category)}
                onSelect={(e) => e.preventDefault()}
              >
                {category}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Select
        value={filters.sort}
        onValueChange={(value) => onChange({ sort: value as ChannelSort })}
      >
        <SelectTrigger
          size="lg"
          showIcon={false}
          aria-label={t("channels.sort_aria")}
          // Icon-only to maximize space for search input on narrow screens
          className="w-11 shrink-0 justify-center"
        >
          <SelectValue>
            {filters.sort === "viewers" ? (
              <ArrowDown10 className="size-5 text-muted-foreground" />
            ) : (
              <ArrowDownAZ className="size-5 text-muted-foreground" />
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent size="lg">
          <SelectItem value="viewers">{t("channels.sort_viewers")}</SelectItem>
          <SelectItem value="alphabetical">
            {t("channels.sort_alphabetical")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
