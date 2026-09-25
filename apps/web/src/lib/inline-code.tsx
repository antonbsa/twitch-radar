import { Fragment, type ReactNode } from "react"

/**
 * Splits `text` on backtick-delimited spans and renders each as a `<code>`
 * element — the changelog's only inline formatting (ADR 0049 entries are
 * plain-language text, not full markdown). Same
 * split-and-map-over-parts shape as `interpolateNodes`
 * (lib/i18n-react.tsx), kept separate since it matches on literal
 * backticks rather than named `{param}` placeholders.
 */
export function renderInlineCode(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, index) => {
    const match = /^`([^`]+)`$/.exec(part)
    if (!match) return <Fragment key={index}>{part}</Fragment>
    return <code key={index}>{match[1]}</code>
  })
}
