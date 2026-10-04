import { toast } from "sonner"
import { isReconnectRequiredError } from "@/lib/errors"

/** Error toast for a failed mutation; silent on a 401, which keeps the reconnect flow instead. */
export function showMutationErrorToast(error: Error, message: string): void {
  if (isReconnectRequiredError(error)) return
  toast.error(message)
}
