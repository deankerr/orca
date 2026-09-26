import { v } from 'convex/values'
import { z } from 'zod'

import { internalMutation } from '../../../_generated/server'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../../ingestion/work'
import type { Scan } from '../../scan/extract'
import { pairTimes } from '../../scan/time'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './table'

/** Commit supplied stats and the work item's completion atomically. */
export const commit = internalMutation({
  args: { work_id: workId, ...pairTimes.fields, rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:stats-history] commit', { work_id: args.work_id, inserts: args.rows.length })
    const work = await pendingWork(ctx, args.work_id, 'stats')

    if (work === null) {
      return null
    }

    assertWorkOutput(work, args, args.rows)
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_STATS_TABLE, row)
    }
    await completeWork(ctx, args.work_id)
    return null
  },
})

/** Retain every supplied observation, including repeated values. */
export function prepare(scan: Scan) {
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
