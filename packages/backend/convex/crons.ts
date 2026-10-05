import { cronJobs } from 'convex/server'

import { internal } from '#generated/api'

const crons = cronJobs()

crons.cron('collectors/analytics', '5 0 * * *', internal.collectors.analytics.scheduled, {})
crons.cron('collectors/topApps', '15 0 * * *', internal.collectors.topApps.scheduled, {})
crons.cron('collectors/scan', '40 * * * *', internal.collectors.scan.scheduled, {})

crons.cron('ingest', '43 * * * *', internal.ingest.scheduled, {})

crons.interval('public-api/v2', { minutes: 5 }, internal.public_api.v2.cache.refresh, {})

export default crons
