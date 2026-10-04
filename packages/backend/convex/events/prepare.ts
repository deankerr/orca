import { pick } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import { Operation } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'

import { encodePricing, normalizeEndpoint, normalizeModel, normalizeProvider } from '../entities'
import type { Scan, ScanPair } from '../scan'
import { compare } from './compare'
import type { EventRow } from './table'

/** Compare endpoint-present entities; historical enrichment happens when events commit. */
export function prepare(pair: ScanPair): EventRow[] {
  const previous = project(pair.previous)
  const next = project(pair.next)

  return (
    [
      ['models', 'model'],
      ['providers', 'provider'],
      ['endpoints', 'endpoint'],
    ] as const
  ).flatMap(([collection, entity_kind]) =>
    compare(previous[collection], next[collection]).map((change) =>
      createRow({
        scan_at: pair.next.scan_at,
        observation: change.type === Operation.REMOVE ? previous : next,
        previous,
        entity_kind,
        change,
      }),
    ),
  )
}

function project(scan: Scan) {
  const modelIds = new Set([...scan.endpoints.values()].map((endpoint) => endpoint.model_id))

  return {
    models: Object.fromEntries(
      [...scan.models]
        .filter(([id]) => modelIds.has(id))
        .map(([id, model]) => [id, normalizeModel(model)]),
    ),
    providers: Object.fromEntries(
      [...scan.providers].map(([id, provider]) => [id, normalizeProvider(provider)]),
    ),
    endpoints: Object.fromEntries(
      [...scan.endpoints].map(([id, endpoint]) => [id, normalizeEndpoint(endpoint)]),
    ),
  }
}

/** Resolve every identity within the selected observation and construct its complete event row. */
function createRow({
  scan_at,
  observation,
  previous,
  entity_kind,
  change,
}: {
  scan_at: string
  observation: ReturnType<typeof project>
  previous: ReturnType<typeof project>
  entity_kind: EventRow['entity_kind']
  change: IChange
}): EventRow {
  const fields = {
    scan_at,
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
      ...(change.type === Operation.UPDATE &&
      change.changes?.some((field) => field.key === 'pricing') === true
        ? {
            pricing: {
              before: encodePricing(required(previous.endpoints, change.key).pricing),
              after: encodePricing(endpoint.pricing),
            },
          }
        : {}),
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
