import { cn } from "@/lib/utils"

/** The app mark, served per environment by the app-icon Vite plugin so dev and preview show their marker color. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icon-small.svg"
      alt=""
      aria-hidden
      className={cn("shrink-0", className)}
    />
  )
}
