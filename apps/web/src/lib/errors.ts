export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId: string
  }
}

export class ApiRequestError extends Error {
  status: number
  code: string
  requestId: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.status = status
    this.code = body.error.code
    this.requestId = body.error.requestId
  }
}

/**
 * A 401 means the Twitch session must be renewed: `useSessionAwareMutation`
 * routes it to the reconnect flow, so callers skip their generic error UI.
 */
export function isReconnectRequiredError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401
}
