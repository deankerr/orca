import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ExtractedEndpoint } from '#scans/extraction'

import type { EndpointListingRow } from '../catalog/tables/listings'
import { ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from '../catalog/tables/listings'
import { compare } from '../compare'
import type { ScanPair } from './input'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  pair: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  const rows: EndpointListingRow[] = []

  for (const [id, endpoint] of pair.next.endpoints) {
    const previous = pair.previous.endpoints.get(id)
    const listing = endpointListing(endpoint)

    if (previous !== undefined && compare(endpointListing(previous), listing).length === 0) {
      continue
    }

    rows.push({ ...listing, scan_at: pair.next.scan_at, state: 'listed' })
  }

  for (const [id, endpoint] of pair.previous.endpoints) {
    if (!pair.next.endpoints.has(id)) {
      rows.push({ ...endpointListing(endpoint), scan_at: pair.next.scan_at, state: 'unlisted' })
    }
  }

  await ctx.runMutation(internal.ingestion.listingHistory.write, { registration_id, rows })
}

export const write = internalMutation({
  args: { registration_id: registrationId, rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'listingHistory', async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, row)
      }
    })

    return null
  },
})

function endpointListing(endpoint: ExtractedEndpoint) {
  return {
    endpoint_id: endpoint.id,
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
  }
}
