import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { getNumberEnv } from '../../lib/env'

export function getAnalyticsWorkflowConfig() {
  return {
    everyHours: getNumberEnv('ORCA_WORKFLOWS_ANALYTICS_EVERY_HOURS', 0),
  }
}

export const start = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const config = getAnalyticsWorkflowConfig()
    const hour = new Date().getUTCHours()
    if (config.everyHours <= 0 || hour % config.everyHours !== 0) {
      return null
    }

    const timestampDate = new Date()
    timestampDate.setUTCSeconds(0, 0)

    await ctx.scheduler.runAfter(0, internal.workflows.analytics.process.run, {
      timestamp: timestampDate.getTime(),
    })

    return null
  },
})
