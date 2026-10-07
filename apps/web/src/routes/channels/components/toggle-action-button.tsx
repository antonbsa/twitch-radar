import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ToggleActionButtonProps {
  /** Once done, the button stays visible but disabled, showing the done state. */
  isDone: boolean
  isPending: boolean
  idleIcon: ReactNode
  idleLabel: string
  /** Fuller name for screen readers when the visible label leans on context. */
  idleAriaLabel?: string
  doneIcon: ReactNode
  doneLabel: string
  onClick: () => void
  className?: string
}

/** Secondary action that turns into a disabled confirmation once it has run. */
export function ToggleActionButton({
  isDone,
  isPending,
  idleIcon,
  idleLabel,
  idleAriaLabel,
  doneIcon,
  doneLabel,
  onClick,
  className,
}: ToggleActionButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      aria-label={isDone ? undefined : idleAriaLabel}
      disabled={isDone || isPending}
      className={cn("gap-1.5", className)}
      onClick={isDone ? undefined : onClick}
    >
      {isDone ? doneIcon : idleIcon}
      {isDone ? doneLabel : idleLabel}
    </Button>
  )
}
