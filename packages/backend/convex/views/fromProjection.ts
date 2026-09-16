import * as R from 'remeda'

import { flattenMetadata } from '../projections'
import type { Metadata, ScanProjection } from '../projections'
import type { EndpointRow, MetadataRecord, ModelRow, ProviderRow } from './entities.table'
import type { EndpointPricingRow, EndpointStatsRow } from './series.table'

export type ViewRows = {
  scan_at: string
  models: Map<string, ModelRow>
  providers: Map<string, ProviderRow>
  endpoints: Map<string, Omit<EndpointRow, 'unlisted_at'>>
  pricing: Map<string, EndpointPricingRow>
  stats: Map<string, EndpointStatsRow>
}

/** Adapt shared records to current table schemas; ownership and scope are already resolved. */
export function createViewRows({ catalog, stats: readings, scan_at }: ScanProjection): ViewRows {
  const models = new Map(
    Object.entries(catalog.models).map(([id, row]) => [
      id,
      {
        ...row,
        scan_at,
        metadata: storedMetadata(row.metadata),
      },
    ]),
  )
  const providers = new Map(
    Object.entries(catalog.providers).map(([id, row]) => [
      id,
      {
        ...row,
        scan_at,
        metadata: storedMetadata(row.metadata),
      },
    ]),
  )
  const endpoints: ViewRows['endpoints'] = new Map()
  const pricing: ViewRows['pricing'] = new Map()
  for (const [id, row] of Object.entries(catalog.endpoints)) {
    const { discount, overrides, ...meters } = row.pricing
    const price = {
      discount,
      meters: R.pickBy(meters, R.isString),
      overrides: overrides
        ?.map((override) => storedMetadata(flattenMetadata(override)))
        .filter((override) => Object.keys(override).length > 0),
    }
    endpoints.set(id, { ...row, scan_at, metadata: storedMetadata(row.metadata), pricing: price })
    pricing.set(id, { ...price, endpoint_id: id, scan_at })
  }
  const stats = new Map(Object.entries(readings).map(([id, row]) => [id, { ...row, scan_at }]))
  return { scan_at, models, providers, endpoints, pricing, stats }
}

/** Restrict values and keys only as required by the existing Convex metadata schema. */
function storedMetadata(metadata: Metadata): MetadataRecord {
  const result: MetadataRecord = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (key.length === 0 || key.startsWith('$') || key.startsWith('_')) {
      continue
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      result[key] = value
    } else if (
      Array.isArray(value) &&
      value.every((item): item is string => typeof item === 'string')
    ) {
      result[key] = value.toSorted()
    }
  }
  return result
}
