import { z } from 'zod'

/** Lightweight provider details; endpoint-specific tags remain on endpoints. */
export const Provider = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  provider_id: z.string(),
  display_name: z.string(),
})

export type Provider = z.infer<typeof Provider>
