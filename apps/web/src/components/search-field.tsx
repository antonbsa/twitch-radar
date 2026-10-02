import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearLabel: string
  /** Accessible name when the placeholder alone isn't enough. */
  ariaLabel?: string
  autoFocus?: boolean
  /** Sizes the wrapper (e.g. a fixed width); defaults to filling the row. */
  className?: string
}

/**
 * Search input with a leading icon and a clear button. h-11/text-base is the
 * 44px touch-target size shared by the Channels filters bar and the Alerts
 * channel search.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  clearLabel,
  ariaLabel,
  autoFocus,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="h-11 pr-10 pl-10 text-base"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange("")}
        aria-label={clearLabel}
        // inset-y-0 + my-auto centers without translate, avoiding conflicts
        // with Button's active:translate-y-px press effect. visibility
        // toggles discrete state so transitions feel smooth and the button
        // becomes non-interactive when hidden.
        className={cn(
          "absolute inset-y-0 right-1.5 my-auto transition-[opacity,visibility] duration-250",
          value.length > 0 ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <X />
      </Button>
    </div>
  )
}
