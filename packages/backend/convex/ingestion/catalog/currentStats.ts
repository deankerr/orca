import { v } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_STATS_TABLE, currentStatsTable } from '../../catalog/tables/current'
import { commitProcess, commitResult, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'

const Metric = z.number().nonnegative().optional().catch(undefined)
const CurrentSample = z
  .object({ p50_throughput: Metric, p50_latency: Metric })
  .transform(R.pickBy(R.isDefined))

export const ingest: Ingestor = createIngestor({
  process: 'currentStats',
  prepare(_ctx, { next, has_later_scan }) {
    if (has_later_scan) {
      return { scan_at: next.scan_at, rows: null }
    }

    const rows = R.pipe(
      next.stats,
      R.filter(({ tier }) => tier === 'default'),
      R.map(({ endpoint_id, sample }) => ({
        endpoint_id,
        metrics: CurrentSample.parse(sample),
      })),
      R.filter(({ metrics }) => !R.isEmpty(metrics)),
      R.map(({ endpoint_id, metrics }) => ({ endpoint_id, ...metrics })),
    )

    return { scan_at: next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentStats.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    // Null defers the snapshot; an empty array replaces it with no readings.
    rows: v.union(v.null(), currentStatsTable.validator.fields.rows),
  },
  returns: commitResult,
  handler: async (ctx, { scan_at, rows, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      if (rows === null) {
        return
      }

      const snapshot = { scan_at, rows }
      const existing = await ctx.db.query(CURRENT_STATS_TABLE).unique()

      if (existing === null) {
        await ctx.db.insert(CURRENT_STATS_TABLE, snapshot)
      } else if (snapshot.scan_at > existing.scan_at) {
        await ctx.db.replace(CURRENT_STATS_TABLE, existing._id, snapshot)
      }
    }),
})
