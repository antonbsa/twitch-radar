import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ALL_CATEGORIES,
  type ChannelFilters,
  type ChannelSort,
} from "@/lib/channel-filters"

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
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search channels..."
          aria-label="Search channels"
          className="pl-8"
        />
      </div>

      {categories.length > 0 && (
        <Select
          value={filters.category}
          onValueChange={(value) => onChange({ category: value })}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filter by category"
            className="w-24 shrink-0 sm:w-32"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.sort}
        onValueChange={(value) => onChange({ sort: value as ChannelSort })}
      >
        <SelectTrigger
          size="sm"
          aria-label="Sort channels"
          className="w-24 shrink-0 sm:w-32"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewers">Viewers</SelectItem>
          <SelectItem value="alphabetical">Name (A-Z)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
