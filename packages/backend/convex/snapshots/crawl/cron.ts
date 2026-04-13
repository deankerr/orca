import { literals } from 'convex-helpers/validators'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { getBooleanEnv } from '../../lib/env'

export function getSnapshotCronConfig() {
  return {
    enabled: getBooleanEnv('ORCA_CRAWL_CRON_ENABLED', false),
    uptimesEveryHours: 6,
    topAppsEveryHours: 12,
    analyticsEveryHours: 12,
  }
}

export const runSnapshot = internalAction({
  args: {
    type: literals('full', 'minimal'),
  },
  handler: async (ctx, { type }) => {
    const config = getSnapshotCronConfig()
    if (!config.enabled) {
      return
    }

    const hour = new Date().getUTCHours()
    const isHour = (every: number) => every > 0 && hour % every === 0

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      uptimes: type === 'full' && isHour(config.uptimesEveryHours),
      topApps: type === 'full' && isHour(config.topAppsEveryHours),
      analytics: type === 'full' && isHour(config.analyticsEveryHours),
      onComplete: { materialize: true },
    })
  },
})
