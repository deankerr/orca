import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { encodePricing } from '../../catalog/pricing'
import type { EndpointPriceRow } from '../../catalog/tables/pricing'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from '../../catalog/tables/pricing'
import { compare } from '../../compare'
import {
  commitProcess,
  commitResult,
  createIngestor,
  removeProcess,
  removeResult,
} from '../ingestor'
import type { Ingestor } from '../ingestor'
import { endpointPricing } from '../lenses'

export const ingest: Ingestor = createIngestor({
  process: 'pricingHistory',
  prepare(_ctx, pair) {
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

    return { scan_at: pair.next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.pricingHistory.write, args),
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.pricingHistory.remove, args),
})

export const remove = internalMutation({
  args: { scan_at: v.string(), process: v.string() },
  returns: removeResult,
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(ENDPOINT_PRICES_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(ENDPOINT_PRICES_TABLE, row._id)
      }
    }),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(endpointPricesTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_PRICES_TABLE, row)
      }
    }),
})
