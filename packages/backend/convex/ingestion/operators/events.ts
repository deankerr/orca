import { ConvexError } from 'convex/values'
import { Operation } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'
import * as R from 'remeda'

import { encodePricing } from '../../catalog/pricing'
import type { EventRow } from '../../catalog/tables/events'
import { compare } from '../../compare'
import { endpointEntity, modelEntity, providerEntity } from '../lenses'
import type { Collections, Source } from './source'

const collections = [
  ['models', 'model'],
  ['providers', 'provider'],
  ['endpoints', 'endpoint'],
] as const

/** Selected differences previous → next, dated at the introduced scan; a baseline has none. */
export function derive({ previous: previousScan, next: nextScan }: Source): EventRow[] {
  if (previousScan === null) {
    return []
  }

  const previous = eventEntities(previousScan)
  const next = eventEntities(nextScan)

  return collections.flatMap(([collection, entity_kind]) =>
    compare(previous[collection], next[collection]).map((change) =>
      createRow({ scan_at: nextScan.scan_at, previous, next, entity_kind, change }),
    ),
  )
}

function eventEntities(scan: Collections) {
  return {
    models: R.mapValues(Object.fromEntries(scan.models), modelEntity),
    providers: R.mapValues(Object.fromEntries(scan.providers), providerEntity),
    endpoints: R.mapValues(Object.fromEntries(scan.endpoints), endpointEntity),
  }
}

function createRow({
  scan_at,
  previous,
  next,
  entity_kind,
  change,
}: {
  scan_at: string
  previous: ReturnType<typeof eventEntities>
  next: ReturnType<typeof eventEntities>
  entity_kind: EventRow['entity_kind']
  change: IChange
}): EventRow {
  // Removed entities and their related identities belong to the previous observation.
  const observation = change.type === Operation.REMOVE ? previous : next
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
        model: R.pick(required(observation.models, change.key), ['model_id', 'display_name']),
      },
    }
  }

  if (entity_kind === 'provider') {
    return {
      ...fields,
      entity_kind,
      context: {
        provider: R.pick(required(observation.providers, change.key), [
          'provider_id',
          'display_name',
        ]),
      },
    }
  }

  const endpoint = required(observation.endpoints, change.key)
  const row: Extract<EventRow, { entity_kind: 'endpoint' }> = {
    ...fields,
    entity_kind,
    context: {
      model: R.pick(required(observation.models, endpoint.model_id), ['model_id', 'display_name']),
      provider: R.pick(required(observation.providers, endpoint.provider_id), [
        'provider_id',
        'display_name',
      ]),
      endpoint: R.pick(endpoint, ['endpoint_id', 'provider_tag', 'provider_display_name']),
    },
  }

  if (
    change.type === Operation.UPDATE &&
    change.changes?.some((field) => field.key === 'pricing') === true
  ) {
    const before = required(previous.endpoints, change.key)

    row.context.pricing = {
      before: encodePricing(before.pricing),
      after: encodePricing(endpoint.pricing),
    }
  }

  return row
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
