import { z } from 'zod'

import type { MutationCtx } from '../../_generated/server'
import { CURRENT_STATS_TABLE } from './table'
import type { CurrentStatsRow } from './table'

type EndpointStatsObservation = { id: string; stats?: unknown; statsByTier?: unknown }

/** Replace the complete stats snapshot inside the caller's acceptance transaction. */
export async function write(
  ctx: MutationCtx,
  scanAt: string,
  rows: CurrentStatsRow[],
): Promise<void> {
  const snapshot = await ctx.db.query(CURRENT_STATS_TABLE).unique()
  const next = { scan_at: scanAt, rows }

  await (snapshot === null
    ? ctx.db.insert(CURRENT_STATS_TABLE, next)
    : ctx.db.replace(CURRENT_STATS_TABLE, snapshot._id, next))
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
export function prepare(endpoints: Iterable<EndpointStatsObservation>): CurrentStatsRow[] {
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
