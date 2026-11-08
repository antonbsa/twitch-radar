import { z } from "zod"
import { SUPPORTED_LANGUAGES } from "../db/repositories/users"

export const UserDto = z
  .object({
    id: z.string(),
    twitch_user_id: z.string(),
    twitch_login: z.string(),
    twitch_display_name: z.string(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    last_follow_sync_at: z.iso.datetime().nullable(),
    language: z.enum(SUPPORTED_LANGUAGES),
    notifications_paused_at: z.iso.datetime().nullable(),
    twitch_reconnect_required: z.boolean(),
  })
  .strict()

/** Shared by `GET /me` and both `PATCH /me/*` routes (ADR 0067). */
export const MeResponse = z.object({ data: UserDto }).strict()
export type MeResponse = z.infer<typeof MeResponse>
