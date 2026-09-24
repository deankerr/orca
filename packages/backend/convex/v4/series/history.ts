import { omit } from 'convex-helpers'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { parseRawJson, recordAtUncapped } from '../records/read'
import { EndpointValue } from '../scan/entities'
import { listingsThrough } from './listings'
import { pricesThrough } from './prices'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointPricesTable } from './table'
import type { EndpointPriceRow } from './table'

const listingValidator = v.object({
  scan_at: v.string(),
  state: v.union(v.literal('listed'), v.literal('unlisted')),
  model_id: v.string(),
  provider_id: v.string(),
})

const priceValidator = endpointPricesTable.validator.omit('endpoint_id')

const endpointValidator = v.object({
  endpoint_id: v.string(),
  provider_tag: v.string(),
  listings: v.array(listingValidator),
  prices: v.array(priceValidator),
})

/** One positively metered span. A listing gap or relationship change starts a new span. */
export type PricingTrace = {
  endpoint_id: string
  provider_tag: string
  model_id: string
  provider_id: string
  start: number
  end: number
  samples: Array<[number, number]>
  current: boolean
}

type HistoryEndpoint = {
  endpoint_id: string
  provider_tag: string
  listings: Array<{
    scan_at: string
    state: 'listed' | 'unlisted'
    model_id: string
    provider_id: string
  }>
  prices: Array<Omit<EndpointPriceRow, 'endpoint_id'>>
}

/**
 * Pricing history for one model through the clock.
 * Candidate endpoints come from the model listing index. Each endpoint's own history supplies the
 * row that closes an association, including a row that names a different model.
 * ATTENTION: `provider_tag` is the latest retained accessor, not a historical listing field.
 * There is no provider listing index, so provider-scoped history is not served from this read.
 */
export const pricing = internalQuery({
  args: { model_id: v.string(), meter: v.string(), cutoff: v.optional(v.string()) },
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    endpoints: v.array(endpointValidator),
    traces: v.array(
      v.object({
        endpoint_id: v.string(),
        provider_tag: v.string(),
        model_id: v.string(),
        provider_id: v.string(),
        start: v.number(),
        end: v.number(),
        samples: v.array(v.array(v.number())),
        current: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

    if (cutoff === null) {
      return { as_of: null, endpoints: [], traces: [] }
    }

    const indexRows = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) =>
        q.eq('model_id', args.model_id).lte('scan_at', cutoff),
      )
      .collect()

    const endpointIds = [...new Set(indexRows.map((row) => row.endpoint_id))]
    const endpoints: HistoryEndpoint[] = []

    for (const endpointId of endpointIds) {
      const listings = await listingsThrough(ctx, endpointId, cutoff)
      const prices = await pricesThrough(ctx, endpointId, cutoff)

      const record = await recordAtUncapped(ctx, 'endpoint', endpointId, cutoff)
      endpoints.push({
        endpoint_id: endpointId,
        provider_tag:
          record === null ? '' : EndpointValue.parse(parseRawJson(record.raw_json)).provider_tag,
        listings: listings.map((row) => ({
          scan_at: row.scan_at,
          state: row.state,
          model_id: row.model_id,
          provider_id: row.provider_id,
        })),
        prices: prices.map((row) => omit(row, ['_id', '_creationTime', 'endpoint_id'])),
      })
    }

    return {
      as_of: cutoff,
      endpoints,
      traces: pricingTraces(endpoints, args.model_id, args.meter, cutoff),
    }
  },
})

/**
 * Build meter traces for one model from listing and price rows.
 * A listing row closes the current span. The span stays open only while that row lists this model.
 * A provider change on this model starts a fresh trace. A move to another model ends it.
 * A missing, zero, or non-finite meter also closes the span.
 */
export function pricingTraces(
  endpoints: readonly HistoryEndpoint[],
  modelId: string,
  meter: string,
  asOf: string,
): PricingTrace[] {
  const end = Date.parse(asOf)
  const traces: PricingTrace[] = []

  for (const endpoint of endpoints) {
    let trace: PricingTrace | undefined
    let listedHere = false
    let providerId = ''
    const listings = new Map(endpoint.listings.map((row) => [row.scan_at, row]))
    const prices = new Map(endpoint.prices.map((row) => [row.scan_at, row]))
    const times = [...new Set([...listings.keys(), ...prices.keys()])].toSorted()

    for (const scanAt of times) {
      const at = Date.parse(scanAt)
      const listing = listings.get(scanAt)

      if (listing !== undefined) {
        if (trace !== undefined) {
          trace.end = at
          trace.current = false
          trace = undefined
        }

        listedHere = listing.state === 'listed' && listing.model_id === modelId
        providerId = listing.provider_id
      }

      const price = prices.get(scanAt)

      if (!listedHere || price === undefined) {
        continue
      }

      const value = Number(price.meters[meter])

      if (!Number.isFinite(value) || value <= 0) {
        if (trace !== undefined) {
          trace.end = at
          trace.current = false
          trace = undefined
        }

        continue
      }

      if (trace === undefined) {
        trace = {
          endpoint_id: endpoint.endpoint_id,
          provider_tag: endpoint.provider_tag,
          model_id: modelId,
          provider_id: providerId,
          start: at,
          end,
          samples: [],
          current: true,
        }
        traces.push(trace)
      }

      const previous = trace.samples.at(-1)

      if (previous === undefined || previous[1] !== value) {
        trace.samples.push([at, value])
      }
    }
  }

  return traces
}
