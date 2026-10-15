import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const COMMITS_TABLE = 'ingestion_commits' as const

/** A process's output is retained unless removed_at is set, including intentionally empty output. */
export const commitsTable = defineTable({
  scan_at: v.string(),
  process: v.string(),
  removed_at: v.optional(v.number()),
}).index('by_scan_at_and_process', ['scan_at', 'process'])
