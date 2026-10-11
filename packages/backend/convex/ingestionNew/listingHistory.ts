import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScannedEndpoint, ScanPair } from '#scanNew/model'

import type { EndpointListingRow } from '../catalogNew/tables/listings'
import { ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from '../catalogNew/tables/listings'
import { compare } from '../compare'

export async function ingest(ctx: ActionCtx, pair: ScanPair): Promise<void> {
  const rows: EndpointListingRow[] = []

  for (const [id, { endpoint }] of pair.next.endpoints) {
    const previous = pair.previous.endpoints.get(id)
    const listing = endpointListing(endpoint)

    if (
      previous !== undefined &&
      compare(endpointListing(previous.endpoint), listing).length === 0
    ) {
      continue
    }

    rows.push({ ...listing, scan_at: pair.next.scan_at, state: 'listed' })
  }

  for (const [id, { endpoint }] of pair.previous.endpoints) {
    if (!pair.next.endpoints.has(id)) {
      rows.push({ ...endpointListing(endpoint), scan_at: pair.next.scan_at, state: 'unlisted' })
    }
  }

  await ctx.runMutation(internal.ingestionNew.listingHistory.write, { rows })
}

export const write = internalMutation({
  args: { rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, row)
    }

    return null
  },
})

function endpointListing(endpoint: ScannedEndpoint) {
  return {
    endpoint_id: endpoint.id,
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
  }
}
