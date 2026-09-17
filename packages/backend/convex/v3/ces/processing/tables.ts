import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Content owns everything presentation needs; job references explain lineage. Creation order is
// Convex's default ordering, so events need neither a sequence nor a duplicate creation timestamp.
export const events = defineTable({
  jobs: v.array(v.id('ces_jobs')),
  content: v.string(),
})
