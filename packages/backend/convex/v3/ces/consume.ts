import type { Infer } from 'convex/values'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { ScanComparison } from '../../projections'
import { INITIAL_SCAN_ARTIFACT_ID } from '../ingestions.table'
import type { jobFields } from './entityChange'
import { prepare } from './ingestion/prepare'

/** Accept an externally prepared comparison. Source loading and processing cadence belong to callers. */
export async function consume(ctx: Pick<ActionCtx, 'runMutation'>, comparison: ScanComparison) {
  // Currently the first observation is only a baseline; the caller still records scan completion.
  if (comparison.previous.id === INITIAL_SCAN_ARTIFACT_ID) {
    console.log('CES baseline established', { scan_at: comparison.next.scan_at })
    return
  }
  const batch_id = await ctx.runMutation(internal.v3.ces.ingestion.storage.begin, {
    from_scan_at: comparison.previous.scan_at,
    scan_at: comparison.next.scan_at,
  })
  let jobs: Infer<typeof jobFields>[] = []
  let count = 0
  for (const job of prepare(comparison)) {
    jobs.push(job)
    count += 1
    if (jobs.length === 20) {
      await ctx.runMutation(internal.v3.ces.ingestion.storage.append, { batch_id, jobs })
      jobs = []
    }
  }
  if (jobs.length > 0) {
    await ctx.runMutation(internal.v3.ces.ingestion.storage.append, { batch_id, jobs })
  }
  await ctx.runMutation(internal.v3.ces.ingestion.storage.complete, { batch_id })
  console.log('CES ingestion accepted', {
    from_scan_at: comparison.previous.scan_at,
    scan_at: comparison.next.scan_at,
    jobs: count,
  })
}
