import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AddGlobalCategorySheet } from "@/components/add-global-category-sheet"
import { useAuth } from "@/context/auth-context"
import {
  usePreferences,
  useRemoveGlobalPreference,
} from "@/hooks/use-preferences"

export function AlertsPage() {
  const { data: preferences, isLoading, isError } = usePreferences()
  const { reconnectRequired } = useAuth()
  const removePreference = useRemoveGlobalPreference()
  const [addSheetOpen, setAddSheetOpen] = useState(false)

  const globalPreferences = preferences?.global ?? []

  return (
    <div>
      <div className="px-4 py-3">
        <h1 className="text-lg font-semibold">Alerts</h1>
      </div>

      <div className="px-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setAddSheetOpen(true)}
        >
          <Plus className="size-4" />
          Add Category
        </Button>
      </div>

      <div className="mt-3">
        {isLoading && (
          <div className="space-y-1 px-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && isError && reconnectRequired && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p>Your Twitch connection needs to be renewed.</p>
            <a
              href="/api/auth/twitch/start"
              className="mt-1 inline-block text-primary underline"
            >
              Reconnect Twitch
            </a>
          </div>
        )}

        {!isLoading && isError && !reconnectRequired && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Failed to load alerts. Try again later.
          </p>
        )}

        {!isLoading && !isError && globalPreferences.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No global alerts set.
          </p>
        )}

        {!isLoading &&
          !isError &&
          globalPreferences.map((pref) => (
            <div
              key={pref.id}
              className="flex items-center justify-between border-b border-border px-4 py-3"
            >
              <span className="text-sm">{pref.category_name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${pref.category_name}`}
                onClick={() => removePreference.mutate(pref.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
      </div>

      <AddGlobalCategorySheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        disabledCategoryIds={globalPreferences.map((pref) => pref.category_id)}
      />
    </div>
  )
}
