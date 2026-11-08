import { expect } from "vitest"
import type { ZodType } from "zod"
import { ErrorEnvelope } from "../../../apps/api/src/contracts/errors"

/**
 * Asserts status, content type and that the whole body matches its response
 * contract (ADR 0067); returns the typed body for behavioral assertions.
 */
export async function expectConforms<T>(
  res: Response,
  status: number,
  schema: ZodType<T>,
): Promise<T> {
  expect(res.status).toBe(status)
  expect(res.headers.get("content-type")).toBe(
    "application/json; charset=utf-8",
  )
  const result = schema.safeParse(await res.json())
  if (!result.success) {
    throw new Error(`Contract violation:\n${result.error.message}`)
  }
  return result.data
}

/** `expectConforms` against the ADR 0009 envelope, then checks its `code`. */
export async function expectApiError(
  res: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await expectConforms(res, status, ErrorEnvelope)
  expect(body.error.code).toBe(code)
}
