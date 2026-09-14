import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Prevents a click event on the dismissed element after a pointerdown closes
 * a DismissableLayer (Select/DropdownMenu), avoiding the click from
 * triggering an action on the element underneath.
 */
export function preventOutsideClickThrough(event: {
  target: EventTarget | null
}) {
  const target = event.target
  if (!(target instanceof Element)) return
  target.addEventListener(
    "click",
    (clickEvent) => {
      clickEvent.preventDefault()
      clickEvent.stopPropagation()
    },
    { capture: true, once: true },
  )
}
