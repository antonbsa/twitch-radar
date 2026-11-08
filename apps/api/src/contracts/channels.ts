import { z } from "zod"

export const FollowedChannelDto = z
  .object({
    broadcaster_user_id: z.string(),
    broadcaster_login: z.string(),
    broadcaster_display_name: z.string(),
    broadcaster_profile_image_url: z.string().nullable(),
    followed_at: z.iso.datetime().nullable(),
    is_live: z.boolean(),
    stream_id: z.string().nullable(),
    category_id: z.string().nullable(),
    category_name: z.string().nullable(),
    title: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    viewer_count: z.number().nullable(),
    started_at: z.iso.datetime().nullable(),
    category_started_at: z.iso.datetime().nullable(),
    last_live_at: z.iso.datetime().nullable(),
    last_category_id: z.string().nullable(),
    last_category_name: z.string().nullable(),
  })
  .strict()

/** Shared by `GET /channels/followed` and `POST /sync/follows`. */
export const FollowedChannelsResponse = z
  .object({ data: z.array(FollowedChannelDto) })
  .strict()
export type FollowedChannelsResponse = z.infer<typeof FollowedChannelsResponse>
