import * as R from 'remeda'

import type { ExtractedEndpoint } from '#scans/extraction'

import type { ObservationRow } from '../../catalog/tables/observations'
import { compare } from '../../compare'
import { previousCollections } from './source'
import type { Collections, Source } from './source'

const parents = [
  ['model', 'model_id'],
  ['provider', 'provider_id'],
] as const

/** Changed selected state dated at the introduced scan; a baseline emits its complete state. */
export function derive(source: Source): ObservationRow[] {
  const previous = previousCollections(source)
  const { next } = source
  const { scan_at } = next

  // Parents exist only through their endpoints, so their state is the listed-endpoint count.
  const parentRows = parents.flatMap(([entity_kind, key]) => {
    const before = R.countBy([...previous.endpoints.values()], R.prop(key))
    const after = R.countBy([...next.endpoints.values()], R.prop(key))

    return R.pipe(
      R.unique([...Object.keys(before), ...Object.keys(after)]),
      R.map((entity_id) => ({
        entity_kind,
        entity_id,
        scan_at,
        endpoint_count: after[entity_id] ?? 0,
      })),
      R.filter(({ entity_id, endpoint_count }) => endpoint_count !== (before[entity_id] ?? 0)),
    )
  })

  const listedRows = R.pipe(
    [...next.endpoints],
    R.filter(([entity_id, endpoint]) => {
      const listed = previous.endpoints.get(entity_id)

      return listed === undefined || compare(context(listed), context(endpoint)).length > 0
    }),
    R.map(([entity_id, endpoint]) => endpointRow(entity_id, scan_at, true, endpoint)),
  )

  const unlistedRows = R.pipe(
    [...previous.endpoints],
    R.filter(([entity_id]) => !next.endpoints.has(entity_id)),
    R.map(([entity_id, endpoint]) => endpointRow(entity_id, scan_at, false, endpoint)),
  )

  return [...parentRows, ...listedRows, ...unlistedRows]
}

function endpointRow(
  entity_id: string,
  scan_at: string,
  detected: boolean,
  endpoint: Collections['endpoints'] extends ReadonlyMap<string, infer E> ? E : never,
): ObservationRow {
  return { entity_kind: 'endpoint', entity_id, scan_at, detected, ...context(endpoint) }
}

function context(endpoint: Pick<ExtractedEndpoint, 'model_id' | 'provider_id' | 'provider_tag'>) {
  return {
    model_id: endpoint.model_id,
    provider_id: endpoint.provider_id,
    provider_tag: endpoint.provider_tag,
  }
}
