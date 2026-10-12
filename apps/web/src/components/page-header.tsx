import type { ReactNode } from "react"
import { AppIcon } from "@/components/app-icon"

/** Title row shared by the tab pages, so the h1 sits at the same size and position on every one; `actions` goes on the right. */
export function PageHeader({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-2 px-4">
      <div className="flex items-center gap-2">
        <AppIcon className="size-8 rounded-md" />
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {actions}
    </div>
  )
}
