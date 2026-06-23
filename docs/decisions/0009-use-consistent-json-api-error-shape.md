# 0009 - Use A Consistent JSON API Error Shape

## Status

Accepted

## Context

The Worker API needs a predictable error contract for the frontend, tests, and future integrations.

## Decision

Use this JSON shape for API errors:

```json
{
  "error": {
    "code": "not_found",
    "message": "Route not found",
    "requestId": "request-id"
  }
}
```

All API error responses should use `application/json; charset=utf-8`.

## Consequences

- Route handlers should throw or return errors through the shared error helper.
- Tests can assert a single error shape across endpoints.
- Internal error details should be logged server-side rather than exposed to clients.
