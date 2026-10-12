import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ExtractedStats } from '#scans/extraction'

import { CURRENT_STATS_TABLE, currentStatsTable } from '../catalog/tables/current'
import type { CurrentStatsRow } from '../catalog/tables/current'
import type { ScanPair } from './input'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { next }: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  const rows: CurrentStatsRow[] = []

  for (const sample of next.stats) {
    const stats = endpointCurrentStats(sample)

    if (stats !== null) {
      rows.push(stats)
    }
  }

  await ctx.runMutation(internal.ingestion.currentStats.write, {
    registration_id,
    scan_at: next.scan_at,
    rows,
  })
}

export const write = internalMutation({
  args: { registration_id: registrationId, ...currentStatsTable.validator.fields },
  returns: v.null(),
  handler: async (ctx, { registration_id, ...snapshot }) => {
    await commitProcess(ctx, registration_id, 'currentStats', async () => {
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
}: ExtractedStats): CurrentStatsRow | null {
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
