import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'

import { encodePricing } from '../catalog/pricing'
import type { EndpointPriceRow } from '../catalog/tables/pricing'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from '../catalog/tables/pricing'
import { compare } from '../compare'
import type { ScanPair } from './input'
import { endpointPricing } from './lenses'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  pair: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  const rows: EndpointPriceRow[] = []

  for (const [id, endpoint] of pair.next.endpoints) {
    const previous = pair.previous.endpoints.get(id)
    const pricing = endpointPricing(endpoint.pricing)

    if (
      previous !== undefined &&
      compare(endpointPricing(previous.pricing), pricing).length === 0
    ) {
      continue
    }

    rows.push({ endpoint_id: id, scan_at: pair.next.scan_at, ...encodePricing(pricing) })
  }

  await ctx.runMutation(internal.ingestion.pricingHistory.write, { registration_id, rows })
}

export const write = internalMutation({
  args: { registration_id: registrationId, rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'pricingHistory', async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_PRICES_TABLE, row)
      }
    })

    return null
  },
})
