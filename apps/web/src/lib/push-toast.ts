import { toast } from "sonner"
import type { PushStatus } from "@/hooks/use-push-notifications"

interface ShowEnablePushToastArgs {
  status: PushStatus
  enable: () => void
  t: (key: string, params?: Record<string, string>) => string
}

/**
 * Surfaces the push-enable prompt after a preference is saved while push
 * isn't enabled on this device (#29) — otherwise the preference "works"
 * server-side with no way for the user to know they won't be notified.
 *
 * No-op for "enabled" (nothing to prompt), "unsupported" (nothing the user
 * can do about it here — the Account tab already renders that state), or
 * "checking" (status hasn't resolved yet).
 */
export function showEnablePushToast({
  status,
  enable,
  t,
}: ShowEnablePushToastArgs): void {
  if (
    status === "enabled" ||
    status === "unsupported" ||
    status === "checking"
  ) {
    return
  }

  if (status === "denied") {
    toast(t("push.banner_blocked"))
    return
  }

  toast(t("push.banner_prompt"), {
    action: {
      label: t("push.banner_enable_cta"),
      onClick: enable,
    },
  })
}
