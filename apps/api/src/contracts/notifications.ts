import { z } from "zod"

export const NotificationSnoozeDto = z
  .object({
    id: z.string(),
    user_id: z.string(),
    broadcaster_user_id: z.string(),
    category_id: z.string(),
    fire_at: z.iso.datetime(),
    status: z.string(),
    created_at: z.iso.datetime(),
  })
  .strict()

/** `POST /notifications/snooze`, `201` new or `200` the existing pending one. */
export const NotificationSnoozeResponse = z
  .object({ data: NotificationSnoozeDto })
  .strict()
export type NotificationSnoozeResponse = z.infer<
  typeof NotificationSnoozeResponse
>

export const NotificationSnoozesResponse = z
  .object({ data: z.array(NotificationSnoozeDto) })
  .strict()
export type NotificationSnoozesResponse = z.infer<
  typeof NotificationSnoozesResponse
>

export const BroadcasterMuteDto = z
  .object({
    id: z.string(),
    broadcaster_user_id: z.string(),
    created_at: z.iso.datetime(),
  })
  .strict()

/** `POST /notifications/mutes`, `201` new or `200` existing. */
export const BroadcasterMuteResponse = z
  .object({ data: BroadcasterMuteDto })
  .strict()
export type BroadcasterMuteResponse = z.infer<typeof BroadcasterMuteResponse>

export const BroadcasterMutesResponse = z
  .object({ data: z.array(BroadcasterMuteDto) })
  .strict()
export type BroadcasterMutesResponse = z.infer<typeof BroadcasterMutesResponse>
