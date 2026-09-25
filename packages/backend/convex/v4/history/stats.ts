import { withoutSystemFields } from 'convex-helpers'
import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { completeStep, stepArgs } from '../ingestion/step'
import type { Execution, ObservationPair } from '../ingestion/step'
import type { ExtractedScan } from '../scan'
import { pageArgs, pageResult, emptyPage } from './pagination'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './table'

const reading = z.number().nonnegative().optional().catch(undefined)

/** V3's current default-tier grid metrics; malformed or missing measurements stay absent. */
export const Stats = convexToZod(endpointStatsTable.validator)
  .extend({
    tier: z.literal('default'),
    sample: z.object({ p50_throughput: reading, p50_latency: reading }),
  })
  .transform(({ sample, ...identity }) => ({ ...identity, ...sample }))

/** Page current samples at one exact scan; missing samples never fall back to earlier readings. */
export const current = query({
  args: pageArgs,
  returns: pageResult(zodOutputToConvex(Stats)),
  handler: async (ctx, args) => {
    const scanAt = await cappedCutoff(ctx, args.cutoff)
    if (scanAt === null) {
      return emptyPage()
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_STATS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
      .paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.filter((row) => row.tier === 'default').map((row) => Stats.parse(row)),
      as_of: scanAt,
    }
  },
})

/** Page one endpoint's supplied samples across tiers, newest first through the completed clock. */
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

/** Write supplied stats and advance the ingestion. */
export const write = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert(V4_ENDPOINT_STATS_TABLE, row)
    }
    return await completeStep(ctx, args)
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  execution: Execution,
): Promise<void> {
  const rows = prepare(pair.next)
  await ctx.runMutation(internal.v4.history.stats.write, { ...execution, rows })
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
