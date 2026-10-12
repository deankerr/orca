import { pick } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import { Operation } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScanPair } from '#scanNew/model'

import { encodePricing } from '../catalog/pricing'
import type { EventRow } from '../catalog/tables/events'
import { EVENTS_TABLE, eventsTable } from '../catalog/tables/events'
import { compare } from '../compare'
import { modelEntity, providerEntity, endpointEntity } from './lenses'
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(ctx: ActionCtx, pair: ScanPair, ingestion_id: InputId): Promise<void> {
  const rows = pair.previous.scan_at === null ? [] : prepare(pair)
  await ctx.runMutation(internal.ingestion.events.write, { ingestion_id, rows })
}

export const write = internalMutation({
  args: { ingestion_id: ingestionId, rows: v.array(eventsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows, ingestion_id }) => {
    await commitStage(ctx, ingestion_id, 'events', async () => {
      for (const row of rows) {
        await ctx.db.insert(EVENTS_TABLE, row)
      }
    })

    return null
  },
})

/** Compare all observed entities; availability and historical classification are separate concerns. */
export function prepare(pair: ScanPair): EventRow[] {
  const previous = eventEntities(pair.previous)
  const next = eventEntities(pair.next)

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

function eventEntities(scan: ScanPair['previous']) {
  return {
    models: Object.fromEntries([...scan.models].map(([id, model]) => [id, modelEntity(model)])),
    providers: Object.fromEntries(
      [...scan.providers].map(([id, provider]) => [id, providerEntity(provider)]),
    ),
    endpoints: Object.fromEntries(
      [...scan.endpoints].map(([id, { endpoint }]) => [id, endpointEntity(endpoint)]),
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
  observation: ReturnType<typeof eventEntities>
  previous: ReturnType<typeof eventEntities>
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
