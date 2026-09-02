import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internalAction } from '../../_generated/server'
import { store } from '../../objects'

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
  handler: async (ctx, args) => {
    const data = await orFetch('/api/frontend/v1/models/find', { schema: DataRecord })
    const path = 'analytics'
    const name = new Date(args.timestamp).toISOString().replace('T', '/')

    await store(ctx, {
      path,
      name,
      text: JSON.stringify({
        workflow: path,
        timestamp: args.timestamp,
        format_version: 1,
        data,
      }),
    })

    return null
  },
})
