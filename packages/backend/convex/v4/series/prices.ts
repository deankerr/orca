import { withoutSystemFields } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import { isDeepEqual } from 'remeda'

import type { Doc } from '../../_generated/dataModel'
import { internalMutation } from '../../_generated/server'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { finishStep, stepArgs } from '../ingestion/step'
import { assertScanAt } from '../scan/time'
import { V4_ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'
import type { EndpointPriceRow } from './table'

/** Append pricing rows, accepting equal retries and rejecting conflicting values. */
export async function appendEndpointPrices(
  ctx: MutationCtx,
  rows: readonly EndpointPriceRow[],
): Promise<void> {
  for (const row of rows) {
    assertScanAt(row.scan_at)
    const existing = await ctx.db
      .query(V4_ENDPOINT_PRICES_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
      )
      .unique()

    if (existing === null) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
      continue
    }

    if (!isDeepEqual(withoutSystemFields(existing), row)) {
      throw new ConvexError(`Conflicting price for ${row.endpoint_id} at ${row.scan_at}`)
    }
  }
}

/** Write this phase's prices and advance the ingestion. */
export const writePrices = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointPricesTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'prices' }, args.rows, appendEndpointPrices),
})

/** Prices at or before a cutoff, oldest first. */
export async function pricesThrough(
  ctx: QueryCtx,
  endpointId: string,
  cutoff: string,
): Promise<Doc<typeof V4_ENDPOINT_PRICES_TABLE>[]> {
  return await ctx.db
    .query(V4_ENDPOINT_PRICES_TABLE)
    .withIndex('by_endpoint_id_and_scan_at', (q) =>
      q.eq('endpoint_id', endpointId).lte('scan_at', cutoff),
    )
    .collect()
}
