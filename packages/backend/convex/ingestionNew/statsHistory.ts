import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScanPair } from '#scanNew/model'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../catalogNew/tables/stats'
import type { EndpointStatsRow } from '../catalogNew/tables/stats'

export async function ingest(ctx: ActionCtx, { next }: ScanPair): Promise<void> {
  const rows: EndpointStatsRow[] = next.stats.map((stats) => ({ ...stats, scan_at: next.scan_at }))

  await ctx.runMutation(internal.ingestionNew.statsHistory.write, { rows })
}

export const write = internalMutation({
  args: { rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      await ctx.db.insert(ENDPOINT_STATS_TABLE, row)
    }

    return null
  },
})
