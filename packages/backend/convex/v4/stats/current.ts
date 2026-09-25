import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalMutation, query } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { findCursor } from '../ingestion/clock'
import { advanceModuleCursor, logStep, stepArgs } from '../ingestion/step'
import type { ModuleStep, ObservationPair } from '../ingestion/step'
import type { ExtractedScan } from '../scan'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './table'
import type { CurrentStatsRow } from './table'

/** Every reading comes from the cursor's scan; the grid always needs all of them. */
export const grid = query({
  args: {},
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    rows: v.array(currentStatsTable.validator),
  }),
  handler: async (ctx) => {
    const cursor = await findCursor(ctx, 'current_stats')
    const rows = await ctx.db.query(V4_CURRENT_STATS_TABLE).collect()
    return { as_of: cursor?.scan_at ?? null, rows: rows.map(withoutSystemFields) }
  },
})

/** Processor transaction: reconcile every row against the scan and advance the cursor atomically. */
export const commitStep = internalMutation({
  args: { ...stepArgs, rows: v.array(currentStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    logStep(args, { incoming: args.rows.length })
    const stored = await ctx.db.query(V4_CURRENT_STATS_TABLE).collect()
    const existing = new Map(stored.map((row) => [row.endpoint_id, row]))
    const inserts = []
    const replaces = []
    for (const row of args.rows) {
      const current = existing.get(row.endpoint_id)
      existing.delete(row.endpoint_id)

      if (current === undefined) {
        inserts.push(row)
      } else if (!isDeepEqual(withoutSystemFields(current), row)) {
        replaces.push({ id: current._id, row })
      }
    }

    logStep(args, {
      stored: stored.length,
      inserts: inserts.length,
      replaces: replaces.length,
      deletes: existing.size,
    })
    for (const row of inserts) {
      await ctx.db.insert(V4_CURRENT_STATS_TABLE, row)
    }
    for (const { id, row } of replaces) {
      await ctx.db.replace(V4_CURRENT_STATS_TABLE, id, row)
    }
    for (const stale of existing.values()) {
      await ctx.db.delete(V4_CURRENT_STATS_TABLE, stale._id)
    }
    return await advanceModuleCursor(ctx, args)
  },
})

/** Depends only on the next scan, so catching up needs only the latest one. */
export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  step: ModuleStep,
): Promise<void> {
  await ctx.runMutation(internal.v4.stats.current.commitStep, { ...step, rows: prepare(pair.next) })
}

const reading = z.number().nonnegative().optional().catch(undefined)

const Sample = z
  .object({ p50_throughput: reading, p50_latency: reading })
  .optional()
  .catch(undefined)

const SuppliedStats = z.object({
  stats: Sample,
  statsByTier: z.object({ default: Sample }).optional().catch(undefined),
})

/** Null, malformed and missing readings are all "no reading". */
function prepare(scan: ExtractedScan): CurrentStatsRow[] {
  return [...scan.endpoints.values()].flatMap((endpoint) => {
    const { stats, statsByTier } = SuppliedStats.parse(endpoint)
    const { p50_throughput, p50_latency } = statsByTier?.default ?? stats ?? {}

    if (p50_throughput === undefined && p50_latency === undefined) {
      return []
    }

    const row: CurrentStatsRow = { endpoint_id: endpoint.id }

    if (p50_throughput !== undefined) {
      row.p50_throughput = p50_throughput
    }

    if (p50_latency !== undefined) {
      row.p50_latency = p50_latency
    }

    return [row]
  })
}
