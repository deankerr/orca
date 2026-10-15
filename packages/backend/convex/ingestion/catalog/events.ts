import { ConvexError, v } from 'convex/values'
import { Operation } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { encodePricing } from '../../catalog/pricing'
import type { EventRow } from '../../catalog/tables/events'
import { EVENTS_TABLE, eventsTable } from '../../catalog/tables/events'
import { compare } from '../../compare'
import { commitProcess, createIngestor, removeProcess } from '../ingestor'
import type { Ingestor } from '../ingestor'
import type { ScanPair } from '../input'
import { modelEntity, providerEntity, endpointEntity } from '../lenses'
import { commitResult, removeResult } from '../results'

export const ingest: Ingestor = createIngestor({
  process: 'events',
  prepare(_ctx, pair) {
    const previous = eventEntities(pair.previous)
    const next = eventEntities(pair.next)
    const collections = [
      ['models', 'model'],
      ['providers', 'provider'],
      ['endpoints', 'endpoint'],
    ] as const

    const changes = collections.flatMap(([collection, entity_kind]) =>
      compare(previous[collection], next[collection]).map((change) => ({ entity_kind, change })),
    )
    const rows = changes.map(({ entity_kind, change }) =>
      createRow({ scan_at: pair.next.scan_at, previous, next, entity_kind, change }),
    )

    return { scan_at: pair.next.scan_at, rows }
  },
  baseline(_ctx, pair) {
    return { scan_at: pair.next.scan_at, rows: [] }
  },
  write: async (ctx, args) => await ctx.runMutation(internal.ingestion.catalog.events.write, args),
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.events.remove, args),
})

function eventEntities(scan: ScanPair['previous']) {
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

export const remove = internalMutation({
  args: { scan_at: v.string(), process: v.string() },
  returns: removeResult,
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(EVENTS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(EVENTS_TABLE, row._id)
      }
    }),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(eventsTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(EVENTS_TABLE, row)
      }
    }),
})
