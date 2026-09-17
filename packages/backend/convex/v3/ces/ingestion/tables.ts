import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { jobFields } from '../entityChange'

// A receipt gates processing until all jobs from a comparison are durable, including empty batches.
export const batches = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
  complete: v.boolean(),
}).index('by_scan_at', ['scan_at'])

export const jobs = defineTable(jobFields.extend({ complete: v.boolean() }))
  .index('by_complete', ['complete'])
  .index('by_scan_at_and_collection_and_entity_id_and_category', [
    'scan_at',
    'collection',
    'entity_id',
    'category',
  ])
