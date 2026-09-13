import { useState } from "react"
import { Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/context/language-context"
import { useCategorySearch } from "@/hooks/use-category-search"
import type { Category } from "@/types/preference"

interface CategorySearchListProps {
  onSelect: (category: Category) => void
  disabledCategoryIds?: string[]
  /**
   * Categories covered by an active global preference. These are labelled but
   * deliberately NOT disabled: pinning one to a single channel keeps the alert
   * alive if the global preference is later removed.
   */
  globalCategoryIds?: string[]
}

export function CategorySearchList({
  onSelect,
  disabledCategoryIds = [],
  globalCategoryIds = [],
}: CategorySearchListProps) {
  const [query, setQuery] = useState("")
  const { data, isFetching, isError, isEnabled } = useCategorySearch(query)
  const { t } = useLanguage()

  return (
    <div className="space-y-2">
      <Input
        placeholder={t("category_search.placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {isEnabled && isFetching && (
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {isEnabled && !isFetching && isError && (
        <p className="px-1 text-sm text-muted-foreground">
          {t("category_search.error")}
        </p>
      )}

      {isEnabled && !isFetching && !isError && data?.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          {t("category_search.empty")}
        </p>
      )}

      {isEnabled && !isFetching && !isError && data && data.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {data.map((category) => {
            const disabled = disabledCategoryIds.includes(category.id)
            const isGlobal = globalCategoryIds.includes(category.id)
            return (
              <li key={category.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(category)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="truncate">{category.name}</span>
                  {isGlobal && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary">
                      <Globe className="size-3" />
                      already in All channels
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
