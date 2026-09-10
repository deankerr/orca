import { ConvexError, v } from 'convex/values'

import { query } from '../../_generated/server'
import { V3_ENDPOINTS_VIEW_TABLE } from '../entities.table'
import { getCurrentScan } from '../ingestions'
import { endpointsListingTable, endpointsPricingTable } from '../series.table'

const listing = endpointsListingTable.validator.pick('scan_at', 'state')
const price = endpointsPricingTable.validator.pick('scan_at', 'meters', 'overrides')
const endpointHistory = v.object({
  id: v.string(),
  tag: v.string(),
  listings: v.array(listing),
  prices: v.array(price),
})

/** Complete retained model history, bounded rather than silently truncated. */
export const get = query({
  args: { modelId: v.string() },
  returns: v.object({ asOf: v.number(), endpoints: v.array(endpointHistory) }),
  handler: async (ctx, { modelId }) => {
    const scan = await getCurrentScan(ctx)

    if (!scan || /^google\/lyria-3-(?:clip|pro)-preview$/.test(modelId)) {
      return { asOf: 0, endpoints: [] }
    }

    const endpoints = await ctx.db
      .query(V3_ENDPOINTS_VIEW_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', modelId))
      .take(201)

    if (endpoints.length > 200) {
      throw new ConvexError('This model has too much history to load in one chart.')
    }

    // ponytail: one model fits one query today; paginate history if this budget is reached.
    let remaining = 8000
    const histories = []

    for (const endpoint of endpoints) {
      const listings = await ctx.db
        .query('v3_endpoints_listing_series')
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', endpoint.endpoint_id).lte('scan_at', scan.scan_at),
        )
        .take(remaining + 1)
      remaining -= listings.length

      if (remaining < 0) {
        throw new ConvexError('This model has too much history to load in one chart.')
      }

      const prices = await ctx.db
        .query('v3_endpoints_pricing_series')
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', endpoint.endpoint_id).lte('scan_at', scan.scan_at),
        )
        .take(remaining + 1)
      remaining -= prices.length

      if (remaining < 0) {
        throw new ConvexError('This model has too much history to load in one chart.')
      }

      histories.push({
        id: endpoint.endpoint_id,
        tag: endpoint.provider_tag,
        listings: listings.map(({ scan_at, state }) => ({ scan_at, state })),
        prices: prices.map(({ scan_at, meters, overrides }) => ({ scan_at, meters, overrides })),
      })
    }

    return { asOf: Date.parse(scan.scan_at), endpoints: histories }
  },
})
