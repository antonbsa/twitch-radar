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
