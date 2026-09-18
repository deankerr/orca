import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internalMutation } from '../_generated/server'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import {
  INITIAL_SCAN_ARTIFACT_ID,
  V3_SCAN_INGESTIONS_TABLE,
  scanIngestionsTable,
} from './ingestions.table'

/** Read the current scan, whether its ingestion record was produced locally or imported. */
export async function getCurrentScan(ctx: Pick<QueryCtx, 'db'>) {
  return await ctx.db.query(V3_SCAN_INGESTIONS_TABLE).order('desc').first()
}

/** Advance only after consumers succeed. Repeated completion is a no-op; stale work fails. */
export async function recordIngestion(
  ctx: Pick<MutationCtx, 'db'>,
  scan: Infer<typeof scanIngestionsTable.validator>,
) {
  const latest = await getCurrentScan(ctx)
  const current = latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID
  if (current === scan.to_artifact_id) {
    return false
  }
  if (current !== scan.from_artifact_id) {
    throw new ConvexError('Scan ingestion cursor changed')
  }
  await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, scan)
  return true
}

export const complete = internalMutation({
  args: scanIngestionsTable.validator,
  returns: v.null(),
  handler: async (ctx, scan) => {
    await recordIngestion(ctx, scan)
    return null
  },
})
