import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const V4_ENDPOINT_LISTINGS_TABLE = 'v4_endpoint_listing_history' as const
export const listingState = v.union(v.literal('listed'), v.literal('unlisted'))

/** One endpoint's availability, associations and addressable tag at a context change. */
export const endpointListingsTable = defineTable({
  scan_at: v.string(),
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
  state: listingState,
})
  .index('by_model_id_and_scan_at', ['model_id', 'scan_at'])
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

export type EndpointListingRow = Infer<typeof endpointListingsTable.validator>
