import { v } from 'convex/values'
import { isDeepEqual } from 'remeda'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import type { ActionCtx } from '../../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../../ingestion/work'
import type { WorkId } from '../../ingestion/work'
import { selectPricing } from '../../pricing'
import type { Scan, ScanPair } from '../../scan/extract'
import { pairTimes } from '../../scan/time'
import { V4_ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'

/** Commit this work item's prices and completion together, including empty output. */
export const commit = internalMutation({
  args: { work_id: workId, ...pairTimes.fields, rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:pricing] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'pricing')

    if (work === null) {
      return null
    }

    assertWorkOutput(work, args, args.rows)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    return null
  },
})

/** Use supplied observations for either a routine attempt or recovery; completion commits with output. */
export async function process(ctx: ActionCtx, pair: ScanPair, work_id: WorkId): Promise<void> {
  const rows = prepare(pair)
  console.log('[v4:pricing] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })
  await ctx.runMutation(internal.v4.history.pricing.ingest.commit, {
    work_id,
    from_scan_at: pair.previous.scan_at,
    scan_at: pair.next.scan_at,
    rows,
  })
}

function prepare(pair: ScanPair) {
  return [...pair.next.endpoints.values()].flatMap((endpoint) => {
    const before = pair.previous.endpoints.get(endpoint.id)
    const pricing = selectPricing(endpoint.pricing)
    return before === undefined || !isDeepEqual(selectPricing(before.pricing), pricing)
      ? [{ endpoint_id: endpoint.id, scan_at: pair.next.scan_at, ...pricing }]
      : []
  })
}

/** Initial observed prices, separately from pair diffs. */
export function initialRows(scan: Scan) {
  return [...scan.endpoints.values()].map((endpoint) => ({
    endpoint_id: endpoint.id,
    scan_at: scan.scan_at,
    ...selectPricing(endpoint.pricing),
  }))
}

export const initialize = internalMutation({
  args: { rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, V4_ENDPOINT_PRICES_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
    }
    return null
  },
})
