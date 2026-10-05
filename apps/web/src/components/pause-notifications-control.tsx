import { BellOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { useSetNotificationsPaused } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

/**
 * "Pause all notifications" switch plus, while paused, a persistent banner
 * with a resume action. ADR 0054 requires the paused state to stay visible.
 */
export function PauseNotificationsControl() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const setPaused = useSetNotificationsPaused()
  const paused = user?.notifications_paused_at != null

  return (
    <div className="space-y-2 px-4 pb-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-sm font-medium">{t("alerts.pause_label")}</span>
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

      {paused && (
        <div
          role="status"
          data-testid="pause-banner"
          className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5"
        >
          <BellOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t("alerts.pause_banner_title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("alerts.pause_banner_body")}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={setPaused.isPending}
            onClick={() => setPaused.mutate(false)}
          >
            {t("alerts.pause_resume")}
          </Button>
        </div>
      )}
    </div>
  )
}
