import { useState } from "react"
import { useNavigate } from "react-router"
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
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"

export function LogOutButton() {
  const { logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate("/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          className="mt-3 w-full"
          disabled={isLoggingOut}
        >
          {t("account.log_out")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("account.log_out_confirm_title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("account.log_out_confirm_description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleLogout}>
            {t("account.log_out")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
