import type { ReactNode } from "react"
import { toast, type ExternalToast } from "sonner"
import type { PushStatus } from "@/hooks/use-push-notifications"

// One slot for "preference saved" and the push-enable prompt that follows it,
// so the prompt replaces the confirmation instead of stacking under it (#24).
const PREFERENCE_TOAST_ID = "preference-feedback"

/**
 * Shows `message` in the shared preference-feedback slot. Sonner merges an
 * update into the toast already holding the id, so every call sets `action`
 * and `duration` explicitly: otherwise a prompt's Enable button and infinite
 * duration would leak into a later "saved" toast.
 */
export function showPreferenceToast(
  message: ReactNode,
  { action, duration }: Pick<ExternalToast, "action" | "duration"> = {},
): void {
  toast(message, { id: PREFERENCE_TOAST_ID, action, duration })
}

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
    showPreferenceToast(t("push.banner_blocked"))
    return
  }

  showPreferenceToast(t("push.banner_prompt"), {
    duration: Infinity,
    action: {
      label: t("push.banner_enable_cta"),
      onClick: () => {
        enable()
        toast.dismiss(PREFERENCE_TOAST_ID)
      },
    },
  })
}
