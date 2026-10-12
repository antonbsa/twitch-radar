import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"

interface DisablePushButtonProps {
  disabled: boolean
  onConfirm: () => void
}

export function DisablePushButton({
  disabled,
  onConfirm,
}: DisablePushButtonProps) {
  const { t } = useLanguage()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={disabled}
        >
          {t("account.disable_notifications")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("account.disable_notifications_confirm_title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("account.disable_notifications_confirm_description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("account.disable_notifications_confirm_action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
