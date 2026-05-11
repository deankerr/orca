import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internalAction } from '../../_generated/server'
import { storeR2Artifact } from '../../lib/r2'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

const DataRecord = z
  .object({ data: z.record(z.string(), z.unknown()) })
  .transform((value) => value.data)

export const run = internalAction({
  args: {
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const data = await orFetch('/api/frontend/models/find', { schema: DataRecord })
    await storeR2Artifact({
      workflow: 'analytics',
      timestamp: args.timestamp,
      format_version: 1,
      data,
    })

    return null
  },
})
