import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.hourly('snapshot-30', { minuteUTC: 30 }, internal.snapshots.crawl.cron.runSnapshot, {})

crons.cron('workflows/analytics', '5 * * * *', internal.workflows.analytics.scheduled.start, {})
crons.cron('workflows/topApps', '15 * * * *', internal.workflows.topApps.scheduled.start, {})

export default crons
