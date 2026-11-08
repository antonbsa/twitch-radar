import { z } from "zod"

/** The ADR 0009 error shape; `ErrorBody` in `http/errors.ts` derives from it. */
export const ErrorEnvelope = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string(),
      })
      .strict(),
  })
  .strict()
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>
