import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'
import { blendedPrice, perMillion, quotedRate } from '@orca/pricing'
import { activeProperties } from '@orca/properties'
import type { PropertyId, Value } from '@orca/properties'
import * as R from 'remeda'

/** The catalogue snapshot query's result: every endpoint with its model and provider. */
export interface Snapshot {
  as_at: string | null
  endpoints: readonly Endpoint[]
  models: readonly Model[]
  providers: readonly Provider[]
}

/** Quoted rates as upstream decimal strings for exact display; zero is absent. */
export interface QuotedRates {
  input: string | null
  output: string | null
  cacheRead: string | null
}

/** One endpoint with its model, provider, active properties, and the numbers views sort, filter, and plot. */
export interface EndpointRow {
  /** Endpoint UUID. */
  id: string
  endpoint: Endpoint
  model: Model
  provider: Provider
  properties: ReadonlyMap<PropertyId, Value | true>
  /** Display with `formatPrice(rate, 6)` from `@orca/backend/numbers`. */
  rates: QuotedRates
  /** Input $/M. */
  input: number | null
  /** Output $/M. */
  output: number | null
  /** Cache-read $/M. */
  cacheRead: number | null
  /** Blended $/M: `(3 × input + output) / 4`. */
  blend: number | null
  /** Median tokens per second. */
  throughput: number | null
  /** Median latency in milliseconds. */
  latency: number | null
  /** Context length in tokens. */
  context: number | null
  /** Model creation time, epoch milliseconds. */
  released: number
  unlisted: boolean
}

export interface Catalog {
  /** Every endpoint whose model and provider resolve, in snapshot order. */
  rows: readonly EndpointRow[]
  byId: ReadonlyMap<string, EndpointRow>
  /** Reference time for recency and release windows: the snapshot scan time, else build time. */
  at: string
}

/** The time properties and release windows are judged at; `as_at` is null before the first scan. */
export function referenceTime(snapshot: Pick<Snapshot, 'as_at'>, now = new Date()): string {
  return snapshot.as_at ?? now.toISOString()
}

/** Join each endpoint to its model and provider and resolve its properties. Unresolved joins are skipped. */
export function buildRows(snapshot: Snapshot, at = referenceTime(snapshot)): EndpointRow[] {
  const models = R.indexBy(snapshot.models, (model) => model.id)
  const providers = R.indexBy(snapshot.providers, (provider) => provider.id)

  return snapshot.endpoints.flatMap((endpoint) => {
    const model = models[endpoint.model.id]
    const provider = providers[endpoint.provider.id]

    if (model === undefined || provider === undefined) {
      return []
    }

    const { pricing, stats } = endpoint
    const input = perMillion(pricing.input)
    const output = perMillion(pricing.output)

    return [
      {
        blend: blendedPrice(input, output),
        cacheRead: perMillion(pricing.input_cache_read),
        context: endpoint.context_length,
        endpoint,
        id: endpoint.id,
        input,
        latency: stats.p50_latency_ms,
        model,
        output,
        properties: activeProperties({ at, endpoint, model, provider }),
        provider,
        rates: {
          cacheRead: quotedRate(pricing.input_cache_read),
          input: quotedRate(pricing.input),
          output: quotedRate(pricing.output),
        },
        released: Date.parse(model.created_at),
        throughput: stats.p50_throughput_tps,
        unlisted: endpoint.unlisted_at !== null,
      },
    ]
  })
}

const catalogs = new WeakMap<Snapshot, Catalog>()

/** Rows for a snapshot, built once per snapshot object. */
export function buildCatalog(snapshot: Snapshot): Catalog {
  const cached = catalogs.get(snapshot)

  if (cached !== undefined) {
    return cached
  }

  const at = referenceTime(snapshot)
  const rows = buildRows(snapshot, at)
  const catalog = { at, byId: new Map(rows.map((row) => [row.id, row])), rows }

  catalogs.set(snapshot, catalog)

  return catalog
}
