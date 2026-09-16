import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CategorySearchList } from "@/components/category-search-list"
import { EnablePushBanner } from "@/components/enable-push-banner"
import { useLanguage } from "@/context/language-context"
import { useAddGlobalPreference } from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import type { Category } from "@/types/preference"

interface AddGlobalCategorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabledCategoryIds: string[]
}

export function AddGlobalCategorySheet({
  open,
  onOpenChange,
  disabledCategoryIds,
}: AddGlobalCategorySheetProps) {
  const addPreference = useAddGlobalPreference()
  const { t } = useLanguage()
  const push = usePushNotifications()
  const [showPushPrompt, setShowPushPrompt] = useState(false)

  // Reset so a dismissed/shown prompt doesn't carry over into the next time
  // this sheet is opened.
  useEffect(() => {
    if (!open) setShowPushPrompt(false)
  }, [open])

  function handleSelect(category: Category) {
    addPreference.mutate(category, {
      onSuccess: () => {
        // Close as before when push is already enabled — there's nothing to
        // prompt. Otherwise keep the sheet open so the user actually sees
        // the prompt instead of it flashing shut with the sheet (#29).
        if (push.status === "enabled") {
          onOpenChange(false)
        } else {
          setShowPushPrompt(true)
        }
      },
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t("add_global_category.title")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {showPushPrompt && (
            <EnablePushBanner
              status={push.status}
              isPending={push.isPending}
              onEnable={push.enable}
              onDismiss={() => setShowPushPrompt(false)}
            />
          )}

          <CategorySearchList
            disabledCategoryIds={disabledCategoryIds}
            onSelect={handleSelect}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
