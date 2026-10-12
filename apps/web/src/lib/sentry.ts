import * as Sentry from "@sentry/react"

/**
 * Starts error reporting (ADR 0047). Reports nothing without a build-time
 * DSN or outside the deployed `preview`/`production` modes, which are also
 * Sentry's `environment` names.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  const mode = import.meta.env.MODE
  if (!dsn || (mode !== "preview" && mode !== "production")) return

  Sentry.init({ dsn, environment: mode })
}

export const reactErrorHandlers = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}
