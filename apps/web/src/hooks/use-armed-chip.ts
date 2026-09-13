import { useEffect, useRef, useState } from "react"

// How long an armed (unconfirmed) removal stays highlighted before silently
// resetting, so a chip never gets stuck waiting for a second click.
const CONFIRM_RESET_MS = 3000

/**
 * Tracks which single chip (by id) is currently armed for a click-to-confirm
 * removal, auto-resetting after a timeout. Arming a different id disarms
 * whichever one was armed before, so at most one chip is ever armed within
 * whatever scope owns this hook instance.
 */
export function useArmedChip() {
  const [armedId, setArmedId] = useState<string | null>(null)
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    }
  }, [])

  function arm(id: string) {
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    setArmedId(id)
    resetTimeoutRef.current = setTimeout(
      () => setArmedId(null),
      CONFIRM_RESET_MS,
    )
  }

  function disarm() {
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    setArmedId(null)
  }

  return { armedId, arm, disarm }
}
