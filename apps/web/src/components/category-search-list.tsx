import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCategorySearch } from "@/hooks/use-category-search"
import type { Category } from "@/types/preference"

interface CategorySearchListProps {
  onSelect: (category: Category) => void
  disabledCategoryIds?: string[]
}

export function CategorySearchList({
  onSelect,
  disabledCategoryIds = [],
}: CategorySearchListProps) {
  const [query, setQuery] = useState("")
  const { data, isFetching, isError, isEnabled } = useCategorySearch(query)

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search categories..."
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
          Failed to search categories.
        </p>
      )}

      {isEnabled && !isFetching && !isError && data?.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          No categories found.
        </p>
      )}

      {isEnabled && !isFetching && !isError && data && data.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {data.map((category) => {
            const disabled = disabledCategoryIds.includes(category.id)
            return (
              <li key={category.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(category)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {category.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
