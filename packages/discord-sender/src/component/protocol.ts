import { z } from 'zod'

// The HTTP seam owns this shape. Storage derives its validator from this schema,
// so changing jobs, scheduling, or persistence does not change the transport.
export const zResponse = z.object({
  body: z.string(),
  channelId: z.string().optional(),
  error: z.string().optional(),
  headers: z.record(z.string(), z.string()),
  messageId: z.string().optional(),
  status: z.number().nullable(),
})

export type ResponseSnapshot = z.infer<typeof zResponse>
