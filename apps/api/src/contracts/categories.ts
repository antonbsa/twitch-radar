import { z } from "zod"

export const CategoryDto = z
  .object({
    id: z.string(),
    name: z.string(),
    box_art_url: z.string().nullable(),
  })
  .strict()

export const CategorySearchResponse = z
  .object({ data: z.array(CategoryDto) })
  .strict()
export type CategorySearchResponse = z.infer<typeof CategorySearchResponse>
