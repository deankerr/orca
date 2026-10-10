import { v } from 'convex/values'

import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import type { Scan, ScanPair } from '#scan/model'

import { compare } from '../../compare'
import { encodePricing, normalizePricing } from '../../entities'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'
import type { EndpointPriceRow } from './table'

/** Commit observed prices inside the Catalog acceptance transaction. */
export async function write(ctx: MutationCtx, rows: EndpointPriceRow[]): Promise<void> {
  for (const row of rows) {
    await ctx.db.insert(ENDPOINT_PRICES_TABLE, row)
  }
}

export function prepare(pair: ScanPair) {
  return [...pair.next.endpoints.values()].flatMap((endpoint) => {
    const before = pair.previous.endpoints.get(endpoint.id)
    const pricing = normalizePricing(endpoint.pricing)
    return before === undefined || compare(normalizePricing(before.pricing), pricing).length > 0
      ? [{ endpoint_id: endpoint.id, scan_at: pair.next.scan_at, ...encodePricing(pricing) }]
      : []
  })
}

/** Initial observed prices, separately from pair diffs. */
export function initialRows(scan: Scan) {
  return [...scan.endpoints.values()].map((endpoint) => ({
    endpoint_id: endpoint.id,
    scan_at: scan.scan_at,
    ...encodePricing(normalizePricing(endpoint.pricing)),
  }))
}

export const initialize = internalMutation({
  args: { rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, ENDPOINT_PRICES_TABLE)
    await write(ctx, rows)
    return null
  },
})
