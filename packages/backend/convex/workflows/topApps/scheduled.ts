import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { env, internalAction } from '../../_generated/server'

export const start = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_WORKFLOWS_TOP_APPS_ENABLED !== 'true') {
      return null
    }

    const timestampDate = new Date()
    timestampDate.setUTCSeconds(0, 0)

    await ctx.scheduler.runAfter(0, internal.workflows.topApps.process.run, {
      timestamp: timestampDate.getTime(),
    })

    return null
  },
})
