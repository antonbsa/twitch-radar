import { ArrowDown10, ArrowDownAZ, ChevronDownIcon } from "lucide-react"
import { SearchField } from "@/components/search-field"
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
import type {
  ChannelFilters,
  ChannelSort,
  LiveCategoryCount,
} from "@/routes/channels/channel-filters"

// 44px touch-target height; responsive width (narrow on mobile, full label width at md+)
const CATEGORY_TRIGGER_CLASSNAME =
  "flex h-11 w-28 min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 text-base whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 sm:w-36 md:w-fit"

interface ChannelFiltersBarProps {
  filters: ChannelFilters
  onChange: (patch: Partial<ChannelFilters>) => void
  categories: LiveCategoryCount[]
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
      <SearchField
        value={filters.search}
        onChange={(search) => onChange({ search })}
        placeholder={t("channels.search_placeholder")}
        ariaLabel={t("channels.search_aria")}
        clearLabel={t("channels.clear_search_aria")}
        className="flex-1"
      />

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
            {categories.map(({ name, liveCount }) => (
              <DropdownMenuCheckboxItem
                key={name}
                checked={filters.categories.includes(name)}
                onCheckedChange={() => toggleCategory(name)}
                onSelect={(e) => e.preventDefault()}
              >
                {name}
                <span className="text-muted-foreground">({liveCount})</span>
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
        <SelectContent size="lg" position="popper" align="end">
          <SelectItem value="viewers">{t("channels.sort_viewers")}</SelectItem>
          <SelectItem value="alphabetical">
            {t("channels.sort_alphabetical")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
