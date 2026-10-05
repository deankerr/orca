import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import type { MutationCtx } from '../../_generated/server'
import { assertInitialTableEmpty } from '../../ingestion/initialization'
import type { ScannedEndpoint, Scan, ScanPair } from '../../scan'
import { ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'
import type { EndpointListingRow } from './table'

/** Commit listing transitions inside the Catalog acceptance transaction. */
export async function write(ctx: MutationCtx, rows: EndpointListingRow[]): Promise<void> {
  for (const row of rows) {
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, row)
  }
}

export function prepare({ previous, next }: ScanPair) {
  const rows: EndpointListingRow[] = []
  for (const endpoint of next.endpoints.values()) {
    const before = previous.endpoints.get(endpoint.id)

    if (
      before === undefined ||
      before.model_id !== endpoint.model_id ||
      before.provider_id !== endpoint.provider_id ||
      before.provider_tag !== endpoint.provider_tag
    ) {
      rows.push(listingRow(endpoint, next.scan_at, 'listed'))
    }
  }
  for (const endpoint of previous.endpoints.values()) {
    if (!next.endpoints.has(endpoint.id)) {
      rows.push(listingRow(endpoint, next.scan_at, 'unlisted'))
    }
  }
  return rows
}

/** Initial availability is seeded once, not inferred by the routine pair processor. */
export function initialRows(scan: Scan) {
  return [...scan.endpoints.values()].map((endpoint) =>
    listingRow(endpoint, scan.scan_at, 'listed'),
  )
}

export const initialize = internalMutation({
  args: { rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    await assertInitialTableEmpty(ctx, ENDPOINT_LISTINGS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, row)
    }
    return null
  },
})

function listingRow(
  endpoint: ScannedEndpoint,
  scan_at: string,
  state: EndpointListingRow['state'],
): EndpointListingRow {
  return {
    endpoint_id: endpoint.id,
    scan_at,
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
    state,
  }
}
