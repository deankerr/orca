import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { isDeepEqual } from 'remeda'

import { internal } from '../../_generated/api'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { advanceModuleCursor, logStep, stepArgs } from '../ingestion/step'
import type { ModuleStep, ObservationPair } from '../ingestion/step'
import { selectPricing } from '../pricing'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'

/** Page one endpoint's complete pricing observations, newest first through its cursor. */
export const list = query({
  args: {
    endpoint_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointPricesTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, 'pricing', args.cutoff)

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

/** Processor transaction: commit prices and the Pricing cursor atomically. */
export const commitStep = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    logStep(args, { inserts: args.rows.length })
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
    }
    return await advanceModuleCursor(ctx, args)
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  step: ModuleStep,
): Promise<void> {
  const rows = prepare(pair)
  await ctx.runMutation(internal.v4.history.pricing.commitStep, { ...step, rows })
}

function prepare(pair: ObservationPair) {
  return [...pair.next.endpoints.values()].flatMap((endpoint) => {
    const before = pair.previous?.endpoints.get(endpoint.id)
    const pricing = selectPricing(endpoint.pricing)
    return before === undefined || !isDeepEqual(selectPricing(before.pricing), pricing)
      ? [{ endpoint_id: endpoint.id, scan_at: pair.next.scan_at, ...pricing }]
      : []
  })
}
