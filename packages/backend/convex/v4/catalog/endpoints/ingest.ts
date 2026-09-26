import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import type { MutationCtx } from '../../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { Scan, ScanPair } from '../../scan/extract'
import { changedRows, departedRows } from '../changes'
import { projectEndpoints, projectModel } from '../project'
import { V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from './table'
import type { CurrentEndpointRow } from './table'

/** Departed endpoints keep the facts of the scan they were last seen in. */
export function prepare(pair: ScanPair) {
  const before = project(pair.previous)
  const after = project(pair.next)
  return [
    ...changedRows(before, after),
    ...departedRows(before, after).map((row) => ({ ...row, unlisted_at: pair.next.scan_at })),
  ]
}

/** Write inside the caller's acceptance transaction. */
export async function write(ctx: MutationCtx, rows: CurrentEndpointRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
      .unique()

    await (existing === null
      ? ctx.db.insert(V4_CURRENT_ENDPOINTS_TABLE, row)
      : ctx.db.replace(V4_CURRENT_ENDPOINTS_TABLE, existing._id, row))
  }
}

export function initialRows(scan: Scan) {
  return [...project(scan).values()]
}

function project(scan: Scan) {
  return projectEndpoints(
    scan,
    new Map([...scan.models].map(([id, model]) => [id, projectModel(model, scan.scan_at)])),
  )
}

export const initialize = internalMutation({
  args: { rows: v.array(currentEndpointsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, V4_CURRENT_ENDPOINTS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_ENDPOINTS_TABLE, row)
    }
    return null
  },
})
