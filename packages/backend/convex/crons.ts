import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.hourly('snapshot-10', { minuteUTC: 10 }, internal.snapshots.crawl.cron.runSnapshot, {
  type: 'minimal',
})
crons.hourly('snapshot-30', { minuteUTC: 30 }, internal.snapshots.crawl.cron.runSnapshot, {
  type: 'full',
})
crons.hourly('snapshot-50', { minuteUTC: 50 }, internal.snapshots.crawl.cron.runSnapshot, {
  type: 'minimal',
})

crons.cron('workflows/analytics', '5 * * * *', internal.workflows.analytics.scheduled.start, {})

export default crons
