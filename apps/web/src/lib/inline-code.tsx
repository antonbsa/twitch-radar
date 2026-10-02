import { Fragment, type ReactNode } from "react"

/**
 * Splits `text` on backtick-delimited spans and renders each as a `<code>`
 * element — the changelog's only inline formatting (ADR 0050 entries are
 * plain-language text, not full markdown).
 */
export function renderInlineCode(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, index) => {
    const match = /^`([^`]+)`$/.exec(part)
    if (!match) return <Fragment key={index}>{part}</Fragment>
    return <code key={index}>{match[1]}</code>
  })
}
