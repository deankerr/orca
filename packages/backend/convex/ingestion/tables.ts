import { vRunResult, vWorkId } from '@convex-dev/workpool'
import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { ingestArgs } from './input'
import { ingestResult } from './results'

export const INGESTION_TARGET_TABLE = 'ingestion_target' as const
export const SCAN_PAIRS_TABLE = 'ingestion_pairs' as const
export const PROCESS_COMMITS_TABLE = 'ingestion_commits' as const
export const SCAN_REGISTRATIONS_TABLE = 'scan_registrations' as const

export const ingestionTargetRange = v.object({ start_at: v.string(), end_at: v.string() })
export const incompletePairStates = ['queued', 'failed'] as const

/** One timeline: the beginning is fixed and the requested end can advance. */
export const ingestionTargetTable = defineTable(ingestionTargetRange)

export const scanPairsTable = defineTable({
  ...ingestArgs.fields,
  state: literals(...incompletePairStates, 'complete'),
  work_id: vWorkId,
  result: v.optional(vRunResult(v.array(ingestResult))),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_state_and_scan_at', ['state', 'scan_at'])
  .index('by_work_id', ['work_id'])

/** A process's output is retained unless removed_at is set, including intentionally empty output. */
export const processCommitsTable = defineTable({
  scan_at: v.string(),
  process: v.string(),
  removed_at: v.optional(v.number()),
}).index('by_scan_at_and_process', ['scan_at', 'process'])

export const scanRegistrationsTable = defineTable({
  ...ingestArgs.pick('from_scan_at', 'scan_at').fields,
  progress: v.union(
    v.object({ kind: v.literal('pending'), completed: v.array(v.string()) }),
    v.object({ kind: v.literal('complete') }),
  ),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_progress_kind_and_scan_at', ['progress.kind', 'scan_at'])
