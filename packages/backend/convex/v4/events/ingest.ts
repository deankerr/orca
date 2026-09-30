import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../ingestion/work'
import type { WorkId } from '../ingestion/work'
import type { ScanPair } from '../scan/extract'
import { pairTimes } from '../scan/time'
import { prepare } from './prepare'
import { eventsTable, V4_EVENTS_TABLE } from './table'

/** Commit this ingestion's events and work completion together, including empty output. */
export const commit = internalMutation({
  args: { work_id: workId, ...pairTimes.fields, rows: v.array(eventsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const work = await pendingWork(ctx, args.work_id, 'events')
    if (work === null) {
      return null
    }

    assertWorkOutput(work, args, args.rows)
    for (const row of args.rows) {
      await ctx.db.insert(V4_EVENTS_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    console.log('[v4:events] commit', { work_id: args.work_id, inserts: args.rows.length })
    return null
  },
})

/** Routine ingestion and recovery use the same supplied observation pair. */
export async function process(ctx: ActionCtx, pair: ScanPair, work_id: WorkId): Promise<void> {
  const rows = prepare(pair)
  console.log('[v4:events] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })
  await ctx.runMutation(internal.v4.events.ingest.commit, {
    work_id,
    from_scan_at: pair.previous.scan_at,
    scan_at: pair.next.scan_at,
    rows,
  })
}
