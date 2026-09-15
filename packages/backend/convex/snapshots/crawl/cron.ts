import { internal } from '../../_generated/api'
import { env, internalAction } from '../../_generated/server'

export const runSnapshot = internalAction({
  args: {},
  handler: async (ctx) => {
    if (env.ORCA_CRAWL_CRON_ENABLED !== 'true') {
      return
    }

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      onComplete: { materialize: true },
    })
  },
})
