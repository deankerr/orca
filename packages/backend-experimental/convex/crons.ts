import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.hourly('snapshot-30', { minuteUTC: 30 }, internal.collection.workflow.run)

export default crons
