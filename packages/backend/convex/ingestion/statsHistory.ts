import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../catalog/tables/stats'
import type { EndpointStatsRow } from '../catalog/tables/stats'
import type { ScanPair } from './input'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { next }: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  const rows: EndpointStatsRow[] = next.stats.map((stats) => ({ ...stats, scan_at: next.scan_at }))

  await ctx.runMutation(internal.ingestion.statsHistory.write, { registration_id, rows })
}

export const write = internalMutation({
  args: { registration_id: registrationId, rows: v.array(endpointStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'statsHistory', async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_STATS_TABLE, row)
      }
    })

    return null
  },
})
