import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CategorySearchList } from "@/components/category-search-list"
import { useLanguage } from "@/context/language-context"
import { useAddGlobalPreference } from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { showEnablePushToast } from "@/lib/push-toast"
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

  function handleSelect(category: Category) {
    addPreference.mutate(category, {
      onSuccess: () => {
        onOpenChange(false)
        showEnablePushToast({ status: push.status, enable: push.enable, t })
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
          <CategorySearchList
            disabledCategoryIds={disabledCategoryIds}
            onSelect={handleSelect}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
