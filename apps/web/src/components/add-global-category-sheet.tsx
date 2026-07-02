import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CategorySearchList } from "@/components/category-search-list"
import { useAddGlobalPreference } from "@/hooks/use-preferences"
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

  function handleSelect(category: Category) {
    addPreference.mutate(category, {
      onSuccess: () => onOpenChange(false),
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add Category</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <CategorySearchList
            disabledCategoryIds={disabledCategoryIds}
            onSelect={handleSelect}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
