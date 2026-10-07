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
        {/* The idle layout reserves the description's rows (invisible sizer) so pausing doesn't shift the content below. */}
        <div className="grid min-w-0 flex-1 grid-rows-[1.25rem_auto]">
          <span
            className={cn(
              "col-start-1 row-start-1 text-sm font-medium",
              !paused && "row-span-2 self-center",
            )}
          >
            {t("alerts.pause_label")}
          </span>
          <p
            role={paused ? "status" : undefined}
            data-testid={paused ? "pause-description" : undefined}
            aria-hidden={!paused}
            className={cn(
              "col-start-1 row-start-2 text-xs text-muted-foreground",
              !paused && "invisible",
            )}
          >
            {t("alerts.pause_description")}
          </p>
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
            paused ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full transition-transform",
              paused
                ? "translate-x-5 bg-primary-foreground"
                : "bg-muted-foreground",
            )}
          />
        </button>
      </div>
    </div>
  )
}
