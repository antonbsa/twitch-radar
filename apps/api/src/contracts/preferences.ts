import { z } from "zod"

export const ChannelPreferenceDto = z
  .object({
    id: z.string(),
    broadcaster_user_id: z.string(),
    category_id: z.string(),
    category_name: z.string(),
    box_art_url: z.string().nullable(),
    created_at: z.iso.datetime(),
  })
  .strict()

export const GlobalPreferenceExclusionDto = z
  .object({
    id: z.string(),
    broadcaster_user_id: z.string(),
    created_at: z.iso.datetime(),
  })
  .strict()

export const GlobalPreferenceDto = z
  .object({
    id: z.string(),
    category_id: z.string(),
    category_name: z.string(),
    box_art_url: z.string().nullable(),
    created_at: z.iso.datetime(),
    // Active exclusions embedded per preference (ADR 0054).
    exclusions: z.array(GlobalPreferenceExclusionDto),
  })
  .strict()

export const PreferencesDto = z
  .object({
    channel: z.array(ChannelPreferenceDto),
    global: z.array(GlobalPreferenceDto),
  })
  .strict()

/** `GET /preferences`. */
export const PreferencesResponse = z.object({ data: PreferencesDto }).strict()
export type PreferencesResponse = z.infer<typeof PreferencesResponse>

/** `POST /preferences/channel`, `201` new or `200` existing. */
export const ChannelPreferenceResponse = z
  .object({ data: ChannelPreferenceDto })
  .strict()
export type ChannelPreferenceResponse = z.infer<
  typeof ChannelPreferenceResponse
>

/** `POST /preferences/global`, `201` new or `200` existing. */
export const GlobalPreferenceResponse = z
  .object({ data: GlobalPreferenceDto })
  .strict()
export type GlobalPreferenceResponse = z.infer<typeof GlobalPreferenceResponse>

/** `POST /preferences/global/:id/exclusions`, `201` new or `200` existing. */
export const GlobalPreferenceExclusionResponse = z
  .object({ data: GlobalPreferenceExclusionDto })
  .strict()
export type GlobalPreferenceExclusionResponse = z.infer<
  typeof GlobalPreferenceExclusionResponse
>
