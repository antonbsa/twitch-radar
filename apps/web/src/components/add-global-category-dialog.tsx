import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategorySearchList } from "@/components/category-search-list"
import { useLanguage } from "@/context/language-context"
import { useAddGlobalPreference } from "@/hooks/use-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { showEnablePushToast } from "@/lib/push-toast"
import type { Category } from "@/types/preference"

interface AddGlobalCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabledCategoryIds: string[]
}

export function AddGlobalCategoryDialog({
  open,
  onOpenChange,
  disabledCategoryIds,
}: AddGlobalCategoryDialogProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader className="h-14 justify-center px-4 pr-14">
          <DialogTitle>{t("add_global_category.title")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CategorySearchList
            disabledCategoryIds={disabledCategoryIds}
            onSelect={handleSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
