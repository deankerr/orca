import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'

export const start = internalAction({
  args: {
    timestamp: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.workflows.analytics.process.run, {
      timestamp: args.timestamp ?? Date.now(),
    })

    return null
  },
})
