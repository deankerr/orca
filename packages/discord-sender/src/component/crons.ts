import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

// Workpool handles short execution failures. Discovery handles longer outages,
// including jobs left open after an earlier drain exhausted its retry budget.
crons.interval('recover unfinished deliveries', { minutes: 5 }, internal.worker.recover, {})

export default crons
