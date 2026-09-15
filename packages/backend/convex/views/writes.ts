import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import type { ScanComparison } from '../projections'
import { endpointsViewTable, modelsViewTable, providersViewTable } from './entities.table'
import { createViewRows } from './fromProjection'
import { endpointsListingTable, endpointsPricingTable, endpointsStatsTable } from './series.table'

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

/** Select changed owners and copy complete rows, including dependent endpoint fields. */
export function planViewWrites(comparison: ScanComparison): ScanProjectionWrite[] {
  const previous = createViewRows(comparison.previous)
  const next = createViewRows(comparison.next)
  const changed = new Map(
    comparison.document.changes.map((group) => [
      group.key,
      new Set(group.changes?.map((owner) => owner.key)),
    ]),
  )
  const changedModels = changed.get('models') ?? new Set<string>()
  const changedProviders = changed.get('providers') ?? new Set<string>()
  const changedEndpoints = changed.get('endpoints') ?? new Set<string>()
  const writes: ScanProjectionWrite[] = []

  for (const row of next.models.values()) {
    if (changedModels.has(row.model_id) && !sameRecord(previous.models.get(row.model_id), row)) {
      writes.push({ table: 'models', row })
    }
  }

  for (const row of next.providers.values()) {
    if (
      changedProviders.has(row.provider_id) &&
      !sameRecord(previous.providers.get(row.provider_id), row)
    ) {
      writes.push({ table: 'providers', row })
    }
  }

  for (const row of next.endpoints.values()) {
    const previousRow = previous.endpoints.get(row.endpoint_id)

    if (changedEndpoints.has(row.endpoint_id) && !sameRecord(previousRow, row)) {
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
    if (
      changedEndpoints.has(row.endpoint_id) &&
      !sameRecord(previous.pricing.get(row.endpoint_id), row)
    ) {
      writes.push({ table: 'endpointsPricing', row })
    }
  }

  for (const row of next.stats.values()) {
    writes.push({ table: 'stats', row })
  }

  return writes
}

// Broad source changes may affect only fields omitted or normalized by the stored views.
function sameRecord<T extends { scan_at: string }>(left: T | undefined, right: T) {
  if (left === undefined) {
    return false
  }

  return R.isDeepEqual(R.omit(left, ['scan_at']), R.omit(right, ['scan_at']))
}
