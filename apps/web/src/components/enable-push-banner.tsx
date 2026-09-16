import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import type { PushStatus } from "@/hooks/use-push-notifications"

interface EnablePushBannerProps {
  status: PushStatus
  isPending: boolean
  onEnable: () => void
  onDismiss: () => void
}

/**
 * Inline prompt shown after a preference is saved while push notifications
 * aren't enabled on this device (see #29) — otherwise the preference "works"
 * server-side with no way for the user to know they won't be notified.
 *
 * Not rendered for "enabled" (nothing to prompt), "unsupported" (nothing the
 * user can do about it here — the Account tab already renders that state),
 * or "checking" (status hasn't resolved yet).
 */
export function EnablePushBanner({
  status,
  isPending,
  onEnable,
  onDismiss,
}: EnablePushBannerProps) {
  const { t } = useLanguage()

  if (
    status === "enabled" ||
    status === "unsupported" ||
    status === "checking"
  ) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <p className="text-sm text-muted-foreground">
        {status === "denied"
          ? t("push.banner_blocked")
          : t("push.banner_prompt")}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {status === "not-enabled" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onEnable}
          >
            {t("push.banner_enable_cta")}
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("push.banner_dismiss_aria")}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
