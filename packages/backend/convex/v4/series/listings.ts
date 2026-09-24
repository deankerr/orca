import { ConvexError, v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import { internalMutation } from '../../_generated/server'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { finishStep, stepArgs } from '../ingestion/step'
import { assertScanAt } from '../scan/time'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'
import type { EndpointListingRow } from './table'

/** Append listing transitions. One endpoint has one row at a scan time. */
export async function appendEndpointListings(
  ctx: MutationCtx,
  rows: readonly EndpointListingRow[],
): Promise<void> {
  for (const row of rows) {
    assertScanAt(row.scan_at)
    const existing = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
      )
      .unique()

    if (existing === null) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
      continue
    }

    if (
      existing.state !== row.state ||
      existing.model_id !== row.model_id ||
      existing.provider_id !== row.provider_id
    ) {
      throw new ConvexError(`Conflicting listing for ${row.endpoint_id} at ${row.scan_at}`)
    }
  }
}

/** Write this phase's listing transitions and advance the ingestion. */
export const writeListings = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointListingsTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'listings' }, args.rows, appendEndpointListings),
})

/** Latest listing transition at or before a cutoff. */
export async function listingAt(
  ctx: QueryCtx,
  endpointId: string,
  cutoff: string,
): Promise<Doc<typeof V4_ENDPOINT_LISTINGS_TABLE> | null> {
  return await ctx.db
    .query(V4_ENDPOINT_LISTINGS_TABLE)
    .withIndex('by_endpoint_id_and_scan_at', (q) =>
      q.eq('endpoint_id', endpointId).lte('scan_at', cutoff),
    )
    .order('desc')
    .first()
}

/** Listing transitions through a cutoff, oldest first. */
export async function listingsThrough(
  ctx: QueryCtx,
  endpointId: string,
  cutoff: string,
): Promise<Doc<typeof V4_ENDPOINT_LISTINGS_TABLE>[]> {
  return await ctx.db
    .query(V4_ENDPOINT_LISTINGS_TABLE)
    .withIndex('by_endpoint_id_and_scan_at', (q) =>
      q.eq('endpoint_id', endpointId).lte('scan_at', cutoff),
    )
    .collect()
}
