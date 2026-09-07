import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { endpointsViewTable, modelsViewTable, providersViewTable } from '../entities.table'
import { endpointsListingTable, endpointsPricingTable, endpointsStatsTable } from '../series.table'
import type { ScanProjection } from './create'

/** Validator for one database write derived from a projection diff. */
export const ScanProjectionWrite = v.union(
  v.object({ table: v.literal('models'), row: modelsViewTable.validator }),
  v.object({ table: v.literal('providers'), row: providersViewTable.validator }),
  v.object({ table: v.literal('endpoints'), row: endpointsViewTable.validator }),
  v.object({ table: v.literal('endpointListings'), row: endpointsListingTable.validator }),
  v.object({ table: v.literal('endpointsPricing'), row: endpointsPricingTable.validator }),
  v.object({ table: v.literal('stats'), row: endpointsStatsTable.validator }),
)

/** One database write derived from a projection diff. */
export type ScanProjectionWrite = Infer<typeof ScanProjectionWrite>

/** Compare adjacent projections and return the writes needed for the next state. */
export function diffScanProjections(
  previous: ScanProjection,
  next: ScanProjection,
): ScanProjectionWrite[] {
  const writes: ScanProjectionWrite[] = []

  for (const row of next.models.values()) {
    if (!sameRecord(previous.models.get(row.model_id), row)) {
      writes.push({ table: 'models', row })
    }
  }

  for (const row of next.providers.values()) {
    if (!sameRecord(previous.providers.get(row.provider_id), row)) {
      writes.push({ table: 'providers', row })
    }
  }

  for (const row of next.endpoints.values()) {
    const previousRow = previous.endpoints.get(row.endpoint_id)

    if (!sameRecord(previousRow, row)) {
      writes.push({ table: 'endpoints', row })
    }

    if (previousRow === undefined) {
      writes.push({
        table: 'endpointListings',
        row: { endpoint_id: row.endpoint_id, scan_at: next.scan_at, state: 'listed' },
      })
    }
  }

  for (const previousEndpoint of previous.endpoints.values()) {
    if (next.endpoints.has(previousEndpoint.endpoint_id)) {
      continue
    }

    writes.push(
      {
        table: 'endpoints',
        row: { ...previousEndpoint, scan_at: next.scan_at, unlisted_at: next.scan_at },
      },
      {
        table: 'endpointListings',
        row: {
          endpoint_id: previousEndpoint.endpoint_id,
          scan_at: next.scan_at,
          state: 'unlisted',
        },
      },
    )
  }

  for (const row of next.pricing.values()) {
    if (!sameRecord(previous.pricing.get(row.endpoint_id), row)) {
      writes.push({ table: 'endpointsPricing', row })
    }
  }

  for (const row of next.stats.values()) {
    writes.push({ table: 'stats', row })
  }

  return writes
}

function sameRecord<T extends { scan_at: string }>(left: T | undefined, right: T) {
  if (left === undefined) {
    return false
  }

  return R.isDeepEqual(R.omit(left, ['scan_at']), R.omit(right, ['scan_at']))
}
