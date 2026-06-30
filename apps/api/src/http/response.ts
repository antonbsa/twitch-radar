export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

export function getRequestId(request: Request): string {
  return request.headers.get("cf-ray") ?? crypto.randomUUID()
}
