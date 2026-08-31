import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const runStats = v.record(v.string(), v.union(v.number(), v.string(), v.boolean()))

export const runsTable = defineTable({
  workflow: v.string(),
  status: v.union(v.literal('running'), v.literal('succeeded'), v.literal('failed')),
  started_at: v.number(),

  completed_at: v.optional(v.number()),
  error: v.optional(v.string()),
  stats: v.optional(runStats),
  artifact_id: v.optional(v.string()),
})
  .index('by_workflow_status', ['workflow', 'status', 'started_at'])
  .index('by_artifact_id', ['artifact_id'])
