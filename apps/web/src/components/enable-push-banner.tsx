import { Button } from "@/components/ui/button"
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
          ? "Notifications are blocked. Go to browser settings to enable."
          : "Enable notifications so you don't miss this alert."}
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
            Enable
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification prompt"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
