interface ApiErrorBody {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiRequestError(
      res.status,
      body ?? {
        error: {
          code: "unknown_error",
          message: res.statusText,
          requestId: "",
        },
      },
    )
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
}
