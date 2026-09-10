import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
  type LiveFilter,
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
    <div className="space-y-2 px-4 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search channels..."
          aria-label="Search channels"
          className="pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filters.liveFilter}
          onValueChange={(value) => {
            if (value) onChange({ liveFilter: value as LiveFilter })
          }}
          aria-label="Filter by live status"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="live">Live now</ToggleGroupItem>
        </ToggleGroup>

        {categories.length > 0 && (
          <Select
            value={filters.category}
            onValueChange={(value) => onChange({ category: value })}
          >
            <SelectTrigger size="sm" aria-label="Filter by category">
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
          <SelectTrigger size="sm" aria-label="Sort channels">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewers">Viewers</SelectItem>
            <SelectItem value="alphabetical">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
