import { vWorkId } from '@convex-dev/workpool'
import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const INGESTION_TARGET_TABLE = 'ingestion_target' as const
export const INGESTION_RECORDS_TABLE = 'ingestion_records' as const
export const PROCESS_COMMITS_TABLE = 'ingestion_commits' as const
export const QUEUE_SCHEDULE_TABLE = 'ingestion_queue_schedule' as const

export const ingestionTargetRange = v.object({ end_at: v.string(), start_at: v.string() })

/** One timeline; the range widens, and its start advances only ahead of all registrations. */
export const ingestionTargetTable = defineTable(ingestionTargetRange)

export const recordKind = literals('pair', 'baseline')
export const recordState = literals('pending', 'queued', 'complete', 'failed', 'withdrawing')
export const currentScope = literals('full', 'changes', 'departures')

export type RecordKind = Infer<typeof recordKind>

export type RecordState = Infer<typeof recordState>

/**
 * One registration from `docs/orca/ingestion-workers.md`. `kind` mirrors whether
 * `from_scan_at` is null, so indexes can separate pairs from baselines.
 */
export const ingestionRecordsTable = defineTable({
  alerts: v.boolean(),
  /** Assigned when queued; meaningful only for the request that received it. */
  current_scope: v.optional(currentScope),
  current_stats: v.optional(v.boolean()),
  error: v.optional(v.string()),
  from_scan_at: v.union(v.string(), v.null()),
  kind: recordKind,
  scan_at: v.string(),
  state: recordState,
  work_id: v.optional(vWorkId),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_kind_and_scan_at', ['kind', 'scan_at'])
  .index('by_kind_and_state_and_scan_at', ['kind', 'state', 'scan_at'])
  .index('by_current_scope_and_state_and_scan_at', ['current_scope', 'state', 'scan_at'])
  .index('by_work_id', ['work_id'])

/** A process's output at a scan is committed exactly while its receipt exists. */
export const processCommitsTable = defineTable({
  // How much output the receipt covers; a retry requesting more writes again. Absent is 0.
  coverage: v.optional(v.number()),
  process: v.string(),
  scan_at: v.string(),
}).index('by_scan_at_and_process', ['scan_at', 'process'])

/**
 * The queue worker's next scheduled step. Completions arrive concurrently; at most one pending
 * step keeps them from stacking queue steps that conflict on the same registry reads.
 */
export const queueScheduleTable = defineTable({ scheduled_id: v.id('_scheduled_functions') })
