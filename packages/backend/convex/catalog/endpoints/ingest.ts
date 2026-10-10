import { v } from 'convex/values'

import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import type { Scan, ScanPair } from '#scan/model'

import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { changedRows, departedRows } from '../changes'
import { encodeEndpoint, projectEndpoints, projectModel } from '../project'
import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from './table'
import type { CurrentEndpointRow } from './table'

/** Departed endpoints keep the facts of the scan they were last seen in. */
export function prepare(pair: ScanPair) {
  const before = project(pair.previous)
  const after = project(pair.next)
  return [
    ...changedRows(before, after),
    ...departedRows(before, after).map((row) => ({ ...row, unlisted_at: pair.next.scan_at })),
  ].map(encodeEndpoint)
}

/** Write inside the caller's acceptance transaction. */
export async function write(
  ctx: MutationCtx,
  rows: Omit<CurrentEndpointRow, 'first_scan_at'>[],
): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
      .unique()

    const next: CurrentEndpointRow = {
      ...row,
      first_scan_at: existing === null ? row.scan_at : existing.first_scan_at,
    }

    await (existing === null
      ? ctx.db.insert(CURRENT_ENDPOINTS_TABLE, next)
      : ctx.db.replace(CURRENT_ENDPOINTS_TABLE, existing._id, next))
  }
}

export function initialRows(scan: Scan) {
  return [...project(scan).values()].map(encodeEndpoint)
}

function project(scan: Scan) {
  return projectEndpoints(
    scan,
    new Map([...scan.models].map(([id, model]) => [id, projectModel(model, scan.scan_at)])),
  )
}

export const initialize = internalMutation({
  args: { rows: v.array(currentEndpointsTable.validator.omit('first_scan_at')) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, CURRENT_ENDPOINTS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, { ...row, first_scan_at: row.scan_at })
    }
    return null
  },
})
