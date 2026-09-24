import { omit } from 'convex-helpers'
import { isDeepEqual } from 'remeda'

import type { CurrentEndpointRow, CurrentModelRow, CurrentProviderRow } from '../catalog/table'
import { canonicalJson } from '../json'
import type { EntityRecordRow } from '../records/table'
import type { ExtractedEndpoint, ExtractedEntity, ExtractedScan } from '../scan'
import type { EndpointListingRow, EndpointPriceRow, EndpointReadingRow } from '../series/table'
import { selectPricing } from './pricing'
import { projectScan } from './product'

/** Selected retained rows and current-entity updates for one observation. */
export type PreparedRows = {
  records: EntityRecordRow[]
  readings: EndpointReadingRow[]
  prices: EndpointPriceRow[]
  listings: EndpointListingRow[]
  models: CurrentModelRow[]
  providers: CurrentProviderRow[]
  endpoints: CurrentEndpointRow[]
}

/** Baseline population writes every in-scope value at the earlier scan's real time. */
export function prepareBaseline(scan: ExtractedScan): PreparedRows {
  const current = projectScan(scan)
  return {
    models: [...current.models.values()],
    providers: [...current.providers.values()],
    endpoints: [...current.endpoints.values()],
    records: allRecords(scan),
    readings: readingRows(scan),
    prices: [...scan.endpoints.values()].map((endpoint) => priceRow(endpoint, scan.scan_at)),
    listings: [...scan.endpoints.values()].map((endpoint) =>
      listingRow(endpoint, scan.scan_at, 'listed'),
    ),
  }
}

/**
 * Forward comparison writes the later scan.
 * Unchanged values and provider-tag-only edits do not append price or listing rows.
 * A comparison contributes at most one price and one listing row per endpoint.
 */
export function prepareForward(previous: ExtractedScan, next: ExtractedScan): PreparedRows {
  const before = projectScan(previous)
  const after = projectScan(next)
  const endpoints = changedCurrentRows(before.endpoints, after.endpoints)

  for (const endpoint of before.endpoints.values()) {
    if (!after.endpoints.has(endpoint.endpoint_id)) {
      endpoints.push({ ...endpoint, scan_at: next.scan_at, unlisted_at: next.scan_at })
    }
  }

  const records = changedRecords(previous, next)
  const prices: EndpointPriceRow[] = []
  const listings: EndpointListingRow[] = []

  for (const endpoint of next.endpoints.values()) {
    const before = previous.endpoints.get(endpoint.entity_id)

    const relationshipChanged =
      before === undefined ||
      before.model_id !== endpoint.model_id ||
      before.provider_id !== endpoint.provider_id

    if (relationshipChanged) {
      listings.push(listingRow(endpoint, next.scan_at, 'listed'))
      prices.push(priceRow(endpoint, next.scan_at))
      continue
    }

    if (!isDeepEqual(selectPricing(before.raw.pricing), selectPricing(endpoint.raw.pricing))) {
      prices.push(priceRow(endpoint, next.scan_at))
    }
  }

  for (const before of previous.endpoints.values()) {
    if (next.endpoints.has(before.entity_id)) {
      continue
    }

    listings.push(listingRow(before, next.scan_at, 'unlisted'))
  }

  return {
    records,
    readings: readingRows(next),
    prices,
    listings,
    models: changedCurrentRows(before.models, after.models),
    providers: changedCurrentRows(before.providers, after.providers),
    endpoints,
  }
}

/** Compare complete projections, including related facts, without observation-time churn. */
function changedCurrentRows<T extends { scan_at: string }>(
  previous: Map<string, T>,
  next: Map<string, T>,
): T[] {
  return [...next.entries()].flatMap(([id, row]) => {
    const before = previous.get(id)
    return before === undefined || !isDeepEqual(omit(before, ['scan_at']), omit(row, ['scan_at']))
      ? [row]
      : []
  })
}

function allRecords(scan: ExtractedScan): EntityRecordRow[] {
  return [
    ...[...scan.models.values()].map((entity) => entityRow('model', entity, scan.scan_at)),
    ...[...scan.providers.values()].map((entity) => entityRow('provider', entity, scan.scan_at)),
    ...[...scan.endpoints.values()].map((entity) => entityRow('endpoint', entity, scan.scan_at)),
  ]
}

function changedRecords(previous: ExtractedScan, next: ExtractedScan): EntityRecordRow[] {
  const records: EntityRecordRow[] = []

  for (const entity of next.models.values()) {
    if (!isDeepEqual(previous.models.get(entity.entity_id), entity)) {
      records.push(entityRow('model', entity, next.scan_at))
    }
  }

  for (const entity of next.providers.values()) {
    if (!isDeepEqual(previous.providers.get(entity.entity_id), entity)) {
      records.push(entityRow('provider', entity, next.scan_at))
    }
  }

  for (const entity of next.endpoints.values()) {
    if (!isDeepEqual(previous.endpoints.get(entity.entity_id), entity)) {
      records.push(entityRow('endpoint', entity, next.scan_at))
    }
  }

  return records
}

function readingRows(scan: ExtractedScan): EndpointReadingRow[] {
  return scan.readings.map((reading) => ({ ...reading, scan_at: scan.scan_at }))
}

function priceRow(endpoint: ExtractedEndpoint, scanAt: string): EndpointPriceRow {
  return {
    endpoint_id: endpoint.entity_id,
    scan_at: scanAt,
    ...selectPricing(endpoint.raw.pricing),
  }
}

function listingRow(
  endpoint: ExtractedEndpoint,
  scanAt: string,
  state: EndpointListingRow['state'],
): EndpointListingRow {
  return {
    scan_at: scanAt,
    endpoint_id: endpoint.entity_id,
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    state,
  }
}

function entityRow(
  kind: EntityRecordRow['entity_kind'],
  entity: ExtractedEntity | ExtractedEndpoint,
  scanAt: string,
): EntityRecordRow {
  const row: EntityRecordRow = {
    scan_at: scanAt,
    entity_kind: kind,
    entity_id: entity.entity_id,
    raw_json: canonicalJson(entity.raw),
  }

  if ('model_id' in entity) {
    row.model_id = entity.model_id
    row.provider_id = entity.provider_id
  }

  return row
}
