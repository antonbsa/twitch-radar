import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { Category } from "@/types/preference"

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

export function useCategorySearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS)
  const isEnabled = debouncedQuery.length >= MIN_QUERY_LENGTH

  const result = useQuery({
    queryKey: ["category-search", debouncedQuery],
    queryFn: () =>
      api.get<{ data: Category[] }>(
        `/categories/search?q=${encodeURIComponent(debouncedQuery)}`,
      ),
    select: (res) => res.data,
    enabled: isEnabled,
  })

  return { ...result, isEnabled }
}
