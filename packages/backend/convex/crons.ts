import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.hourly('snapshot-30', { minuteUTC: 30 }, internal.snapshots.crawl.cron.runSnapshot, {})

crons.cron('workflows/analytics', '5 0 * * *', internal.workflows.analytics.scheduled.start, {})
crons.cron('workflows/topApps', '15 0 * * *', internal.workflows.topApps.scheduled.start, {})
crons.cron('scan/workflow', '40 * * * *', internal.scan.action.run, {})

crons.cron('v3/ingest', '42 * * * *', internal.v3.ingest.scheduled, {})

export default crons
