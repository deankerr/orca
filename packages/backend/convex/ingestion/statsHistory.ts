import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScanPair } from '#scanNew/model'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../catalog/tables/stats'
import type { EndpointStatsRow } from '../catalog/tables/stats'
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { next }: ScanPair,
  ingestion_id: InputId,
): Promise<void> {
  const rows: EndpointStatsRow[] = next.stats.map((stats) => ({ ...stats, scan_at: next.scan_at }))

  await ctx.runMutation(internal.ingestion.statsHistory.write, { ingestion_id, rows })
}

export const write = internalMutation({
  args: { ingestion_id: ingestionId, rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, ingestion_id }) => {
    await commitStage(ctx, ingestion_id, 'statsHistory', async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_STATS_TABLE, row)
      }
    })

    return null
  },
})
