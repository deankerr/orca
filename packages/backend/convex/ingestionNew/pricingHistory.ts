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
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(ctx: ActionCtx, pair: ScanPair, ingestion_id: InputId): Promise<void> {
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

  await ctx.runMutation(internal.ingestionNew.pricingHistory.write, { ingestion_id, rows })
}

export const write = internalMutation({
  args: { ingestion_id: ingestionId, rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, ingestion_id }) => {
    await commitStage(ctx, ingestion_id, 'pricingHistory', async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_PRICES_TABLE, row)
      }
    })

    return null
  },
})
