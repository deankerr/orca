import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'
import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'
import { blendedPrice, perMillion, quotedRate } from '@orca/pricing'
import { activeProperties } from '@orca/properties'
import type { PropertyId, Value } from '@orca/properties'
import { queryOptions } from '@tanstack/react-query'
import type { FunctionReturnType } from 'convex/server'
import * as R from 'remeda'

/** The snapshot query's result: every endpoint with its model and provider. */
export interface SnapshotPayload {
  as_at: string | null
  endpoints: readonly Endpoint[]
  models: readonly Model[]
  providers: readonly Provider[]
}

/** Quoted rates as upstream decimal strings for exact display; a zero rate is a real price of $0. */
interface QuotedRates {
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
  /** Per-token rates; display with `formatRate`. Null when the endpoint states none. */
  rates: QuotedRates
  /** Input $/M; 0 for a free endpoint. */
  input: number | null
  /** Output $/M. */
  output: number | null
  /** Cache-read $/M. */
  cacheRead: number | null
  /** Blended $/M: `(3 × input + output) / 4`; 0 when both rates are zero. */
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

/** The payload's endpoints joined to their models and providers, with the time they are judged at. */
export interface Snapshot {
  /** Every endpoint whose model and provider resolve, in snapshot order. */
  rows: readonly EndpointRow[]
  byId: ReadonlyMap<string, EndpointRow>
  /** Reference time for recency and release windows: the snapshot scan time, else build time. */
  at: string
  /** When the snapshot was scanned; null before the first scan, unlike `at`, which is never null. */
  scanAt: string | null
}

/** The time properties and release windows are judged at; `as_at` is null before the first scan. */
export function referenceTime(payload: Pick<SnapshotPayload, 'as_at'>, now = new Date()): string {
  return payload.as_at ?? now.toISOString()
}

/** Join each endpoint to its model and provider and resolve its properties. Unresolved joins are skipped. */
export function buildRows(payload: SnapshotPayload, at = referenceTime(payload)): EndpointRow[] {
  const models = R.indexBy(payload.models, (model) => model.id)
  const providers = R.indexBy(payload.providers, (provider) => provider.id)

  return payload.endpoints.flatMap((endpoint) => {
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

const snapshots = new WeakMap<SnapshotPayload, Snapshot>()

/** Rows for a payload, built once per payload object. */
export function buildSnapshot(payload: SnapshotPayload): Snapshot {
  const cached = snapshots.get(payload)

  if (cached !== undefined) {
    return cached
  }

  const at = referenceTime(payload)
  const rows = buildRows(payload, at)

  const snapshot = {
    at,
    byId: new Map(rows.map((row) => [row.id, row])),
    rows,
    scanAt: payload.as_at,
  }

  snapshots.set(payload, snapshot)

  return snapshot
}

type SnapshotQuery = typeof api.products.v5.catalog.snapshot

const { queryKey } = convexQuery(api.products.v5.catalog.snapshot, {})

/**
 * The whole catalogue, about 3 MB. The router's query client supplies the Convex `queryFn`, and the
 * Convex subscription keeps the result current, so it never goes stale. Identical queries are deduped.
 */
export const snapshotQuery = queryOptions<
  FunctionReturnType<SnapshotQuery>,
  Error,
  FunctionReturnType<SnapshotQuery>,
  typeof queryKey
>({ queryKey, staleTime: Infinity })
