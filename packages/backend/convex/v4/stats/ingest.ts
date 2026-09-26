import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { pendingPublication, completePublication } from '../ingestion/publication'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './table'
import type { CurrentStatsRow } from './table'

type EndpointStatsObservation = { id: string; stats?: unknown; statsByTier?: unknown }

/** Publish supplied endpoint observations; input selection and loading belong to the caller. */
export async function process(
  ctx: ActionCtx,
  scanAt: string,
  endpoints: Iterable<EndpointStatsObservation>,
): Promise<void> {
  const rows = prepare(endpoints)
  console.log('[v4:current-stats] prepared', {
    scan_at: scanAt,
    rows: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })
  await ctx.runMutation(internal.v4.stats.ingest.publish, { scan_at: scanAt, rows })
}

/** Publish a complete snapshot and its observation time, or ignore superseded/duplicate work. */
export const publish = internalMutation({
  args: { scan_at: v.string(), rows: v.array(currentStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:current-stats] publish', { scan_at: args.scan_at, incoming: args.rows.length })
    if (!(await pendingPublication(ctx, 'current_stats', args.scan_at))) {
      return null
    }

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

    console.log('[v4:current-stats] reconcile', {
      scan_at: args.scan_at,
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
    await completePublication(ctx, 'current_stats', args.scan_at)
    return null
  },
})

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
function prepare(endpoints: Iterable<EndpointStatsObservation>): CurrentStatsRow[] {
  return [...endpoints].flatMap((endpoint) => {
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
