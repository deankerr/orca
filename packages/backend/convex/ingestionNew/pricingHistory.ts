import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScanPair } from '#scanNew/model'

import { encodePricing } from '../catalogNew/pricing'
import type { EndpointPriceRow } from '../catalogNew/tables/pricing'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from '../catalogNew/tables/pricing'
import { compare } from '../compare'
import { endpointPricing } from './lenses'
import { checkpoint } from './progress'
import type { Ownership } from './progress'
import { ownership } from './table'

export async function ingest(ctx: ActionCtx, pair: ScanPair, owner: Ownership): Promise<void> {
  const rows: EndpointPriceRow[] = []

  for (const [id, { endpoint }] of pair.next.endpoints) {
    const previous = pair.previous.endpoints.get(id)
    const pricing = endpointPricing(endpoint.pricing)

    if (
      previous !== undefined &&
      compare(endpointPricing(previous.endpoint.pricing), pricing).length === 0
    ) {
      continue
    }

    rows.push({ endpoint_id: id, scan_at: pair.next.scan_at, ...encodePricing(pricing) })
  }

  await ctx.runMutation(internal.ingestionNew.pricingHistory.write, { ...owner, rows })
}

export const write = internalMutation({
  args: { ...ownership.fields, rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, ...owner }) => {
    if (!(await checkpoint(ctx, owner, 'pricingHistory'))) {
      return null
    }

    for (const row of rows) {
      await ctx.db.insert(ENDPOINT_PRICES_TABLE, row)
    }

    return null
  },
})
