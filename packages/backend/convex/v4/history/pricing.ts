import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { isDeepEqual } from 'remeda'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { V4_PROCESSOR_WORK_TABLE } from '../ingestion/table'
import { assertOutputScan, completeWork, pendingWork } from '../ingestion/work'
import { selectPricing } from '../pricing'
import type { Endpoint, ExtractedScan, LoadedScanPair } from '../scan'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'

/** Page committed pricing observations; the cutoff does not imply gap-free processing. */
export const list = query({
  args: {
    endpoint_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointPricesTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

    if (cutoff === null) {
      return emptyPage()
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_PRICES_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Commit this work item's prices and completion together, including empty output. */
export const commitStep = internalMutation({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE), rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:pricing] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'pricing')

    if (work === null) {
      return null
    }

    assertOutputScan(args.rows, work.scan_at)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    return null
  },
})

export async function process(
  ctx: ActionCtx,
  pair: LoadedScanPair,
  work_id: Id<typeof V4_PROCESSOR_WORK_TABLE>,
): Promise<void> {
  const rows = prepare(pair)

  console.log('[v4:pricing] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })

  await ctx.runMutation(internal.v4.history.pricing.commitStep, { work_id, rows })
}

function prepare(pair: LoadedScanPair) {
  return [...pair.next.endpoints.values()].flatMap((endpoint) => {
    const before = pair.previous.endpoints.get(endpoint.id)
    const pricing = selectPricing(endpoint.pricing)
    return before === undefined || !isDeepEqual(selectPricing(before.pricing), pricing)
      ? [{ endpoint_id: endpoint.id, scan_at: pair.next.scan_at, ...pricing }]
      : []
  })
}

/** Deployment bootstrap owns the first observation, separately from pair diffs. */
export function initialRows(scan: ExtractedScan) {
  return [...scan.endpoints.values()].map((endpoint: Endpoint) => ({
    endpoint_id: endpoint.id,
    scan_at: scan.scan_at,
    ...selectPricing(endpoint.pricing),
  }))
}
