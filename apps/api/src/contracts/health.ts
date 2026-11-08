import { z } from "zod"

export const HealthResponse = z
  .object({
    ok: z.literal(true),
    service: z.literal("twitch-radar-api"),
    environment: z.string(),
    checks: z.object({ d1: z.literal("ok") }).strict(),
  })
  .strict()
export type HealthResponse = z.infer<typeof HealthResponse>
