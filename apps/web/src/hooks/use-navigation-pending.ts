import { useEffect, useState } from "react"

/**
 * Pending flag for a native link that navigates away (e.g. the Twitch OAuth
 * start). Resets when the page is restored from the back/forward cache,
 * otherwise going back from Twitch shows a spinner that never ends.
 */
export function useNavigationPending(): [boolean, () => void] {
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsPending(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  return [isPending, () => setIsPending(true)]
}
