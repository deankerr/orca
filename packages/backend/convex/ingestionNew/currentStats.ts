import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScannedEndpointStats, ScanPair } from '#scanNew/model'

import { CURRENT_STATS_TABLE, currentStatsTable } from '../catalogNew/tables/current'
import type { CurrentStatsRow } from '../catalogNew/tables/current'
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { next }: ScanPair,
  ingestion_id: InputId,
): Promise<void> {
  const rows: CurrentStatsRow[] = []

  for (const sample of next.stats) {
    const stats = endpointCurrentStats(sample)

    if (stats !== null) {
      rows.push(stats)
    }
  }

  await ctx.runMutation(internal.ingestionNew.currentStats.write, {
    ingestion_id,
    scan_at: next.scan_at,
    rows,
  })
}

export const write = internalMutation({
  args: { ingestion_id: ingestionId, ...currentStatsTable.validator.fields },
  returns: v.null(),
  handler: async (ctx, { ingestion_id, ...snapshot }) => {
    await commitStage(ctx, ingestion_id, 'currentStats', async () => {
      const existing = await ctx.db.query(CURRENT_STATS_TABLE).unique()

      if (existing === null) {
        await ctx.db.insert(CURRENT_STATS_TABLE, snapshot)
      } else if (snapshot.scan_at > existing.scan_at) {
        await ctx.db.replace(CURRENT_STATS_TABLE, existing._id, snapshot)
      }
    })

    return null
  },
})

/** Select usable default-tier metrics; absent readings do not carry forward. */
function endpointCurrentStats({
  endpoint_id,
  tier,
  sample,
}: ScannedEndpointStats): CurrentStatsRow | null {
  if (tier !== 'default') {
    return null
  }

  const row: CurrentStatsRow = { endpoint_id }
  const throughput = sample.p50_throughput
  const latency = sample.p50_latency

  if (typeof throughput === 'number' && Number.isFinite(throughput) && throughput >= 0) {
    row.p50_throughput = throughput
  }

  if (typeof latency === 'number' && Number.isFinite(latency) && latency >= 0) {
    row.p50_latency = latency
  }

  return row.p50_throughput === undefined && row.p50_latency === undefined ? null : row
}
