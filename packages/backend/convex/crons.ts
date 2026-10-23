import { cronJobs } from 'convex/server'

import { internal } from '#generated/api'

const crons = cronJobs()

crons.cron('collectors/analytics', '5 0 * * *', internal.collectors.analytics.scheduled, {})
crons.cron('collectors/topApps', '15 0 * * *', internal.collectors.topApps.scheduled, {})
crons.cron('collectors/scan', '40 * * * *', internal.collectors.scan.scheduled, {})
crons.cron('ingestion/sync', '50 * * * *', internal.ingestion.sync.scheduled, {})

crons.cron('public-api/v2', '42 * * * *', internal.public_api.v2.cache.refresh, {})

export default crons
