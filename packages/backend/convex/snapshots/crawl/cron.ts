import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { getBooleanEnv } from '../../lib/env'

export const runSnapshot = internalAction({
  args: {
    type: v.optional(literals('full', 'minimal')),
  },
  handler: async (ctx) => {
    const enabled = getBooleanEnv('ORCA_CRAWL_CRON_ENABLED', false)
    if (!enabled) {
      return
    }

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      onComplete: { materialize: true },
    })
  },
})
