import { pick } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import { Operation } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'

import { selectEndpoint, selectModel, selectProvider } from '../facts'
import type { Scan, ScanPair } from '../scan/extract'
import type { ScanPairTimes } from '../scan/time'
import { compare } from './compare'
import type { EventRow } from './table'

/** Pure pair-to-events factory; identity context never participates in comparison. */
export function prepare(pair: ScanPair): EventRow[] {
  const previous = project(pair.previous)
  const next = project(pair.next)
  const times = { from_scan_at: pair.previous.scan_at, scan_at: pair.next.scan_at }

  return (
    [
      ['models', 'model'],
      ['providers', 'provider'],
      ['endpoints', 'endpoint'],
    ] as const
  ).flatMap(([collection, entity_kind]) =>
    compare(previous[collection], next[collection]).map((change) =>
      createRow({
        ...times,
        observation: change.type === Operation.REMOVE ? previous : next,
        entity_kind,
        change,
      }),
    ),
  )
}

function project(scan: Scan) {
  return {
    models: Object.fromEntries([...scan.models].map(([id, model]) => [id, selectModel(model)])),
    providers: Object.fromEntries(
      [...scan.providers].map(([id, provider]) => [id, selectProvider(provider)]),
    ),
    endpoints: Object.fromEntries(
      [...scan.endpoints].map(([id, endpoint]) => [id, selectEndpoint(endpoint)]),
    ),
  }
}

/** Resolve every identity within the selected observation and construct its complete event row. */
function createRow({
  observation,
  entity_kind,
  change,
  ...times
}: ScanPairTimes & {
  observation: ReturnType<typeof project>
  entity_kind: EventRow['entity_kind']
  change: IChange
}): EventRow {
  const fields = {
    ...times,
    entity_id: change.key,
    type: change.type,
    change_json: JSON.stringify(change),
  }
  if (entity_kind === 'model') {
    return {
      ...fields,
      entity_kind,
      context: {
        model: pick(required(observation.models, change.key), ['model_id', 'display_name']),
      },
    }
  }
  if (entity_kind === 'provider') {
    return {
      ...fields,
      entity_kind,
      context: {
        provider: pick(required(observation.providers, change.key), [
          'provider_id',
          'display_name',
        ]),
      },
    }
  }

  const endpoint = required(observation.endpoints, change.key)
  return {
    ...fields,
    entity_kind,
    context: {
      model: pick(required(observation.models, endpoint.model_id), ['model_id', 'display_name']),
      provider: pick(required(observation.providers, endpoint.provider_id), [
        'provider_id',
        'display_name',
      ]),
      endpoint: pick(endpoint, ['endpoint_id', 'provider_tag', 'provider_display_name']),
    },
  }
}

function required<T>(entities: Record<string, T>, id: string): T {
  const entity = Object.hasOwn(entities, id) ? entities[id] : undefined
  if (entity === undefined) {
    throw new ConvexError({
      message: 'Event identity is missing from its observation',
      entity_id: id,
    })
  }
  return entity
}
