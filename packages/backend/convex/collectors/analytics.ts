import { v } from 'convex/values'
import { up } from 'up-fetch'
import { z } from 'zod'

import { internal } from '#generated/api'
import { env, internalAction, internalMutation } from '#generated/server'
import * as objects from '#objects'

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
  handler: async (ctx, args) => {
    const data = await orFetch('/api/frontend/v1/models/find', { schema: DataRecord })
    const path = 'analytics'
    const name = new Date(args.timestamp).toISOString().replace('T', '/')

    await objects.store(ctx, {
      name,
      path,
      // oxlint-disable sort-keys -- Stored JSON key order is the stable on-disk object format.
      text: JSON.stringify({
        workflow: path,
        timestamp: args.timestamp,
        format_version: 1,
        data,
      }),
      // oxlint-enable sort-keys
    })

    return null
  },
  returns: v.null(),
})

export const scheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (env.ORCA_ANALYTICS_CRON_ENABLED !== 'true') {
      return null
    }

    const timestampDate = new Date()
    timestampDate.setUTCSeconds(0, 0)

    await ctx.scheduler.runAfter(0, internal.collectors.analytics.run, {
      timestamp: timestampDate.getTime(),
    })

    return null
  },
  returns: v.null(),
})
