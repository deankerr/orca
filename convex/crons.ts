import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

const crons = cronJobs()

// * lite crawl - core data only (models, endpoints, providers)
export const snapshotCronLite = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.runQuery(internal.config.getFirst)
    if (!cfg?.enabled) return

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      apps: false,
      uptimes: false,
      modelAuthors: false,
      analytics: false,
      onComplete: { materialize: true },
    })

    console.log(`[cron:snapshot] crawl started`)
  },
})

// * main crawl - core + extras based on hourly config
export const snapshotCronMain = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.runQuery(internal.config.getFirst)
    if (!cfg?.enabled) return

    const h = new Date().getUTCHours()
    const on = (every: number) => every > 0 && h % every === 0

    await ctx.scheduler.runAfter(0, internal.snapshots.crawl.main.run, {
      apps: on(cfg.apps_every_hours),
      uptimes: on(cfg.uptimes_every_hours),
      modelAuthors: false,
      analytics: on(cfg.analytics_every_hours ?? 0),
      onComplete: { materialize: true },
    })

    console.log(`[cron:snapshot:main] crawl started`, {
      apps: on(cfg.apps_every_hours),
      uptimes: on(cfg.uptimes_every_hours),
      analytics: on(cfg.analytics_every_hours ?? 0),
    })
  },
})

crons.hourly('snapshot-10', { minuteUTC: 10 }, internal.crons.snapshotCronLite)
crons.hourly('snapshot-30', { minuteUTC: 30 }, internal.crons.snapshotCronMain)
crons.hourly('snapshot-50', { minuteUTC: 50 }, internal.crons.snapshotCronLite)

export default crons
