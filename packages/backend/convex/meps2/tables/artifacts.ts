import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const artifactsTable = defineTable({
  artifact_id: v.string(),
  workflow: v.string(),
  format: v.string(),

  run_id: v.id('meps2_runs'),
  storage_id: v.id('_storage'),
  content_sha256: v.string(),
  size: v.object({ raw: v.number(), blob: v.number() }),

  created_at: v.number(),
})
  .index('by_artifact_id', ['artifact_id'])
  .index('by_workflow_created_at', ['workflow', 'created_at'])
  .index('by_run_id', ['run_id'])
