import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { V4_PROCESSOR_WORK_TABLE } from '../ingestion/table'
import { assertOutputScan, completeWork, pendingWork } from '../ingestion/work'
import type { ExtractedScan, LoadedScanPair } from '../scan'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './table'

/** Page committed samples across tiers; this processor remains unregistered. */
export const list = query({
  args: {
    endpoint_id: v.string(),
    ...pageArgs,
  },
  returns: pageResult(endpointStatsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

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

/** Commit supplied stats and the work item's completion atomically. */
export const commitStep = internalMutation({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE), rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:stats-history] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'stats')

    if (work === null) {
      return null
    }

    assertOutputScan(args.rows, work.scan_at)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_STATS_TABLE, row)
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
  const rows = prepare(pair.next)

  console.log('[v4:stats-history] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })

  await ctx.runMutation(internal.v4.history.stats.commitStep, { work_id, rows })
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
