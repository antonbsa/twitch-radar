import { useState } from "react"
import { useNavigate } from "react-router"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n"
import { useSyncFollows } from "@/hooks/use-channels"
import {
  usePushNotifications,
  type PushStatus,
} from "@/hooks/use-push-notifications"

function notificationStatusKey(status: PushStatus): string {
  switch (status) {
    case "checking":
      return "account.status_checking"
    case "enabled":
      return "account.status_enabled"
    case "denied":
      return "account.status_denied"
    case "unsupported":
      return "account.status_unsupported"
    default:
      return "account.status_not_enabled"
  }
}

export function AccountPage() {
  const { user, reconnectRequired, logout } = useAuth()
  const { t, language, setLanguage } = useLanguage()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const push = usePushNotifications()
  const navigate = useNavigate()
  const syncFollows = useSyncFollows()

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
    <div className="p-4">
      <h1 className="text-lg font-semibold">{t("account.title")}</h1>

      <div className="mt-4 flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>
            {user?.twitch_display_name?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{user?.twitch_display_name}</p>
          <p className="text-xs text-muted-foreground">
            {t("account.connected")}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium">{t("account.language")}</p>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_LANGUAGES.map((lang: Language) => (
            <Button
              key={lang}
              variant={lang === language ? "default" : "outline"}
              size="sm"
              onClick={() => setLanguage(lang)}
            >
              {t(`account.language_${lang}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium">{t("account.notifications")}</p>
        <p className="text-sm text-muted-foreground">
          {t("account.status", {
            status: t(notificationStatusKey(push.status)),
          })}
        </p>
        {push.status === "not-enabled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={push.isPending}
            onClick={push.enable}
          >
            {t("account.enable_notifications")}
          </Button>
        )}
        {push.status === "enabled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={push.isPending}
            onClick={push.disable}
          >
            {t("account.disable_notifications")}
          </Button>
        )}
        {push.status === "denied" && (
          <p className="text-xs text-muted-foreground">
            {t("account.denied_hint")}
          </p>
        )}
        {push.error && (
          <p className="text-xs text-destructive">{t(push.error)}</p>
        )}
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full"
        disabled={syncFollows.isPending}
        onClick={() => syncFollows.mutate()}
      >
        {t("account.sync_channels")}
      </Button>

      {reconnectRequired && (
        <Button className="mt-3 w-full" asChild>
          <a href="/api/auth/twitch/start">{t("account.reconnect_twitch")}</a>
        </Button>
      )}

      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={isLoggingOut}
        onClick={handleLogout}
      >
        {t("account.log_out")}
      </Button>
    </div>
  )
}
