import { v } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { Scan, ExtractedEndpoint } from '#scans/extraction'

import type { ObservationRow } from '../../catalog/tables/observations'
import { OBSERVATIONS_TABLE, observationsTable } from '../../catalog/tables/observations'
import { compare } from '../../compare'
import {
  commitProcess,
  commitResult,
  createIngestor,
  removeProcess,
  removeResult,
} from '../ingestor'
import type { Ingestor } from '../ingestor'

export const ingest: Ingestor = createIngestor({
  process: 'observations',
  prepare(_ctx, pair) {
    const previousCounts = endpointCounts(pair.previous)
    const nextCounts = endpointCounts(pair.next)
    const { scan_at } = pair.next

    const modelRows = R.pipe(
      R.unique([...pair.previous.models.keys(), ...pair.next.models.keys()]),
      R.map((entity_id) => ({
        entity_kind: 'model' as const,
        entity_id,
        scan_at,
        detected: pair.next.models.has(entity_id),
        endpoint_count: nextCounts.models.get(entity_id) ?? 0,
      })),
      R.filter(
        ({ entity_id, detected, endpoint_count }) =>
          detected !== pair.previous.models.has(entity_id) ||
          endpoint_count !== (previousCounts.models.get(entity_id) ?? 0),
      ),
    )

    const providerRows = R.pipe(
      R.unique([...previousCounts.providers.keys(), ...nextCounts.providers.keys()]),
      R.map((entity_id) => ({
        entity_kind: 'provider' as const,
        entity_id,
        scan_at,
        endpoint_count: nextCounts.providers.get(entity_id) ?? 0,
      })),
      R.filter(
        ({ entity_id, endpoint_count }) =>
          endpoint_count !== (previousCounts.providers.get(entity_id) ?? 0),
      ),
    )

    const detectedEndpointRows = R.pipe(
      [...pair.next.endpoints],
      R.map(([entity_id, endpoint]) => ({
        entity_kind: 'endpoint' as const,
        entity_id,
        scan_at,
        detected: true,
        ...endpointContext(endpoint),
      })),
      R.filter((row) => {
        const previous = pair.previous.endpoints.get(row.entity_id)

        return (
          previous === undefined ||
          compare(endpointContext(previous), endpointContext(row)).length > 0
        )
      }),
    )

    const removedEndpointRows = R.pipe(
      [...pair.previous.endpoints],
      R.filter(([entity_id]) => !pair.next.endpoints.has(entity_id)),
      R.map(([entity_id, endpoint]) => ({
        entity_kind: 'endpoint' as const,
        entity_id,
        scan_at,
        detected: false,
        ...endpointContext(endpoint),
      })),
    )

    const rows: ObservationRow[] = [
      ...modelRows,
      ...providerRows,
      ...detectedEndpointRows,
      ...removedEndpointRows,
    ]

    return { scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.observations.write, args),
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.observations.remove, args),
})

function endpointCounts(scan: Pick<Scan, 'endpoints'>) {
  const endpoints = [...scan.endpoints.values()]

  return {
    models: new Map(R.entries(R.countBy(endpoints, R.prop('model_id')))),
    providers: new Map(R.entries(R.countBy(endpoints, R.prop('provider_id')))),
  }
}

function endpointContext(
  endpoint: Pick<ExtractedEndpoint, 'model_id' | 'provider_id' | 'provider_tag'>,
) {
  return {
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
  }
}

export const remove = internalMutation({
  args: { scan_at: v.string(), process: v.string() },
  returns: removeResult,
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(OBSERVATIONS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(OBSERVATIONS_TABLE, row._id)
      }
    }),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(observationsTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(OBSERVATIONS_TABLE, row)
      }
    }),
})
