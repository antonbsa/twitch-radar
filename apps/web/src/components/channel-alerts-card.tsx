import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { AddCategoryChip } from "@/components/add-category-chip"
import { CategoryChip } from "@/components/category-chip"
import type { ChannelAlertGroup } from "@/lib/alert-groups"

interface ChannelAlertsCardProps {
  group: ChannelAlertGroup
  onAdd: (broadcasterUserId: string) => void
  onRemove: (preferenceId: string) => void
}

export function ChannelAlertsCard({
  group,
  onAdd,
  onRemove,
}: ChannelAlertsCardProps) {
  const hasGlobalOverlap = group.categories.some((c) => c.alsoGlobal)

  return (
    <div
      data-testid="channel-alerts-card"
      data-display-name={group.displayName}
      className="mx-4 mb-2 rounded-lg border border-border bg-card"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar size="sm">
          <AvatarImage src={group.profileImageUrl ?? undefined} alt="" />
          <AvatarFallback>{group.displayName[0]?.toUpperCase()}</AvatarFallback>
          {group.isLive && <AvatarBadge className="bg-red-500" />}
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{group.displayName}</p>
          {group.isUnsynced && (
            <p className="truncate text-xs text-muted-foreground">
              Channel not synced
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {group.categories.map((category) => (
          <CategoryChip
            key={category.preferenceId}
            label={category.categoryName}
            alsoGlobal={category.alsoGlobal}
            onRemove={() => onRemove(category.preferenceId)}
            removeLabel={`Remove ${category.categoryName} for ${group.displayName}`}
          />
        ))}
        {/* An unsynced channel has no FollowedChannel record, so the
            preference sheet has nothing to open with. */}
        {!group.isUnsynced && (
          <AddCategoryChip
            onClick={() => onAdd(group.broadcasterUserId)}
            label={`Add category for ${group.displayName}`}
          />
        )}
      </div>

      {hasGlobalOverlap && (
        <p className="px-3 pb-2.5 text-xs text-muted-foreground">
          Also in All channels
        </p>
      )}
    </div>
  )
}
