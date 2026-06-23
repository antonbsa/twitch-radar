export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId
        }
      } satisfies ErrorBody,
      { status: error.status }
    );
  }

  console.error(error);

  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId
      }
    } satisfies ErrorBody,
    { status: 500 }
  );
}

export function getRequestId(request: Request): string {
  return request.headers.get("cf-ray") ?? crypto.randomUUID();
}
