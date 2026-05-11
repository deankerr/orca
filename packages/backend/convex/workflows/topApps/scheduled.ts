import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { getNumberEnv } from '../../lib/env'

export function getTopAppsWorkflowConfig() {
  return {
    everyHours: getNumberEnv('ORCA_WORKFLOWS_TOP_APPS_EVERY_HOURS', 0),
  }
}

export const start = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const config = getTopAppsWorkflowConfig()
    const hour = new Date().getUTCHours()
    if (config.everyHours <= 0 || hour % config.everyHours !== 0) {
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
