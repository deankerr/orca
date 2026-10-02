import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.cron('workflows/analytics', '5 0 * * *', internal.workflows.analytics.scheduled.start, {})
crons.cron('workflows/topApps', '15 0 * * *', internal.workflows.topApps.scheduled.start, {})
crons.cron('scan/workflow', '40 * * * *', internal.scan.action.run, {})

crons.cron('v4/ingest', '43 * * * *', internal.v4.routine.scheduled, {})

crons.interval('public-api/v2', { minutes: 5 }, internal.public_api.v2.cache.refresh, {})

export default crons
