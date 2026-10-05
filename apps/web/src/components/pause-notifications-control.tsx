import { BellOffIcon, BellRingIcon } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { useSetNotificationsPaused } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

/**
 * "Pause all notifications" switch. While paused it shows the bell-off icon
 * and an explanation, so the state stays visible (ADR 0054).
 */
export function PauseNotificationsControl() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const setPaused = useSetNotificationsPaused()
  const paused = user?.notifications_paused_at != null
  const Icon = paused ? BellOffIcon : BellRingIcon

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <Icon
          aria-hidden="true"
          data-testid="pause-icon"
          className={cn(
            "size-4 shrink-0",
            paused ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{t("alerts.pause_label")}</span>
          {paused && (
            <p
              role="status"
              data-testid="pause-description"
              className="text-xs text-muted-foreground"
            >
              {t("alerts.pause_description")}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={paused}
          aria-label={t("alerts.pause_label")}
          disabled={setPaused.isPending}
          onClick={() => setPaused.mutate(!paused)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
            paused ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-background transition-transform",
              paused && "translate-x-5",
            )}
          />
        </button>
      </div>
    </div>
  )
}
