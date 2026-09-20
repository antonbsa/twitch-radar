import { Fragment, type ReactNode } from "react"

/**
 * Like `interpolate` (lib/i18n.ts) but for text rendered as JSX rather than
 * plain strings: params are arbitrary `ReactNode`, so a caller can pass
 * `<strong>{name}</strong>` to bold a dynamic value instead of getting back
 * an already-flattened string. Formatting stays the caller's decision — this
 * only knows how to splice nodes into the template's `{key}` placeholders.
 *
 * Web UI only (toasts, modals): native push notifications have no rich
 * text, so this is never used by service-worker.js.
 */
export function interpolateNodes(
  template: string,
  params: Record<string, ReactNode>,
): ReactNode {
  const parts = template.split(/(\{\w+\})/g)
  return parts.map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part)
    if (!match) return part
    const key = match[1]
    return key in params ? <Fragment key={index}>{params[key]}</Fragment> : part
  })
}
