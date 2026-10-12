import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { Scan, ExtractedEndpoint } from '#scans/extraction'

import type { ObservationRow } from '../catalog/tables/observations'
import { OBSERVATIONS_TABLE, observationsTable } from '../catalog/tables/observations'
import { compare } from '../compare'
import type { ScanPair } from './input'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export function prepare(pair: ScanPair): ObservationRow[] {
  const rows: ObservationRow[] = []
  const previous = endpointCounts(pair.previous)
  const next = endpointCounts(pair.next)
  const { scan_at } = pair.next

  for (const entity_id of new Set([...pair.previous.models.keys(), ...pair.next.models.keys()])) {
    const detected = pair.next.models.has(entity_id)
    const endpoint_count = next.models.get(entity_id) ?? 0

    if (
      detected !== pair.previous.models.has(entity_id) ||
      endpoint_count !== (previous.models.get(entity_id) ?? 0)
    ) {
      rows.push({ entity_kind: 'model', entity_id, scan_at, detected, endpoint_count })
    }
  }

  for (const entity_id of new Set([...previous.providers.keys(), ...next.providers.keys()])) {
    const endpoint_count = next.providers.get(entity_id) ?? 0

    if (endpoint_count !== (previous.providers.get(entity_id) ?? 0)) {
      rows.push({ entity_kind: 'provider', entity_id, scan_at, endpoint_count })
    }
  }

  for (const [entity_id, endpoint] of pair.next.endpoints) {
    const before = pair.previous.endpoints.get(entity_id)
    const context = endpointContext(endpoint)

    if (before === undefined || compare(endpointContext(before), context).length > 0) {
      rows.push({ entity_kind: 'endpoint', entity_id, scan_at, detected: true, ...context })
    }
  }

  for (const [entity_id, endpoint] of pair.previous.endpoints) {
    if (!pair.next.endpoints.has(entity_id)) {
      rows.push({
        entity_kind: 'endpoint',
        entity_id,
        scan_at,
        detected: false,
        ...endpointContext(endpoint),
      })
    }
  }

  return rows
}

function endpointCounts(scan: Pick<Scan, 'endpoints'>) {
  const models = new Map<string, number>()
  const providers = new Map<string, number>()

  for (const endpoint of scan.endpoints.values()) {
    models.set(endpoint.model_id, (models.get(endpoint.model_id) ?? 0) + 1)
    providers.set(endpoint.provider_id, (providers.get(endpoint.provider_id) ?? 0) + 1)
  }

  return { models, providers }
}

function endpointContext(endpoint: ExtractedEndpoint) {
  return {
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
  }
}

export async function ingest(
  ctx: ActionCtx,
  pair: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  await ctx.runMutation(internal.ingestion.observations.write, {
    registration_id,
    rows: prepare(pair),
  })
}

export const write = internalMutation({
  args: { registration_id: registrationId, rows: v.array(observationsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'observations', async () => {
      for (const row of rows) {
        await ctx.db.insert(OBSERVATIONS_TABLE, row)
      }
    })

    return null
  },
})
