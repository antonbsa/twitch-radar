import type { ReactNode } from "react"
import { ReconnectRequired } from "@/components/reconnect-required"
import { useAuth } from "@/context/auth-context"

interface AsyncSectionProps {
  isLoading: boolean
  isError: boolean
  /** Rendered while loading. */
  skeleton: ReactNode
  /** Shown on a non-reconnect error. */
  errorMessage: string
  children: ReactNode
}

/**
 * Loading → skeleton, error → reconnect prompt or `errorMessage`, else content.
 * The branches are mutually exclusive, so `children` render only once ready.
 */
export function AsyncSection({
  isLoading,
  isError,
  skeleton,
  errorMessage,
  children,
}: AsyncSectionProps) {
  const { reconnectRequired } = useAuth()

  if (isLoading) return skeleton
  if (isError) {
    return reconnectRequired ? (
      <ReconnectRequired />
    ) : (
      <p className="px-4 py-6 text-sm text-muted-foreground">{errorMessage}</p>
    )
  }
  return children
}
