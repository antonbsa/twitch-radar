import { z } from "zod"

export const VapidPublicKeyResponse = z
  .object({ data: z.object({ vapid_public_key: z.string() }).strict() })
  .strict()
export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponse>

export const PushSubscriptionDto = z
  .object({
    id: z.string(),
    user_id: z.string(),
    endpoint: z.string(),
    p256dh: z.string(),
    auth: z.string(),
    user_agent: z.string().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    revoked_at: z.iso.datetime().nullable(),
  })
  .strict()

/** `POST /push-subscriptions`, `201` new or `200` refreshed. */
export const PushSubscriptionResponse = z
  .object({ data: PushSubscriptionDto })
  .strict()
export type PushSubscriptionResponse = z.infer<typeof PushSubscriptionResponse>
