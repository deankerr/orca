import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { advanceModuleCursor, logStep, stepArgs } from '../ingestion/step'
import type { ModuleStep, ObservationPair } from '../ingestion/step'
import type { ExtractedScan } from '../scan'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './table'

/** Page one endpoint's supplied samples across tiers, newest first through its cursor. */
export const list = query({
  args: {
    endpoint_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointStatsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, 'stats', args.cutoff)

    if (cutoff === null) {
      return emptyPage()
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_STATS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Processor transaction: commit supplied stats and the Stats-history cursor atomically. */
export const commitStep = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    logStep(args, { inserts: args.rows.length })
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_STATS_TABLE, row)
    }
    return await advanceModuleCursor(ctx, args)
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  step: ModuleStep,
): Promise<void> {
  const rows = prepare(pair.next)
  await ctx.runMutation(internal.v4.history.stats.commitStep, { ...step, rows })
}

/** Retain every supplied observation, including repeated values. */
function prepare(scan: ExtractedScan) {
  return [...scan.endpoints.values()].flatMap((endpoint) => {
    const { stats, statsByTier } = SuppliedStats.parse(endpoint)
    const samples = { ...statsByTier, default: statsByTier?.default ?? stats }
    return Object.entries(samples).flatMap(([tier, sample]) =>
      sample === undefined
        ? []
        : [{ endpoint_id: endpoint.id, scan_at: scan.scan_at, tier, sample }],
    )
  })
}

const Sample = z
  .record(z.string(), z.union([z.number(), z.string(), z.null()]))
  .transform(({ endpoint_id: _endpointId, ...sample }) => sample)

const SuppliedStats = z.object({
  stats: Sample.optional(),
  statsByTier: z.record(z.string(), Sample).optional(),
})
