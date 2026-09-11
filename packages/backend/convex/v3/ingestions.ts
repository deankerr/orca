import type { QueryCtx } from '../_generated/server'
import { V3_SCAN_INGESTIONS_TABLE } from './ingestions.table'

/** Read the current scan, whether its ingestion record was produced locally or imported. */
export async function getCurrentScan(ctx: Pick<QueryCtx, 'db'>) {
  return await ctx.db.query(V3_SCAN_INGESTIONS_TABLE).order('desc').first()
}
