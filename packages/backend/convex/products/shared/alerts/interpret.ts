import * as R from 'remeda'

import type { Doc } from '#generated/dataModel'
import type { QueryCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../../catalog/tables/observations'
import type { ObservationRow } from '../../../catalog/tables/observations'
import type { EntityAlert } from './curate'
import { interpretEvent } from './prepare'
import type { AlertSource } from './read'

function serving(row: ObservationRow | null): boolean {
  return row !== null && (row.entity_kind === 'endpoint' ? row.detected : row.endpoint_count > 0)
}

type Occurrence = Pick<AlertSource, 'entity_kind' | 'entity_id' | 'scan_at'>

/** Historical classification uses only knowledge strictly earlier than this occurrence. */
export async function interpret(ctx: QueryCtx, source: AlertSource): Promise<EntityAlert | null> {
  return 'change_json' in source
    ? await interpretStoredEvent(ctx, source)
    : await interpretObservation(ctx, source)
}

function earlierObservations(ctx: QueryCtx, { entity_kind, entity_id, scan_at }: Occurrence) {
  return ctx.db
    .query(OBSERVATIONS_TABLE)
    .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).lt('scan_at', scan_at),
    )
}

async function interpretStoredEvent(
  ctx: QueryCtx,
  source: Doc<typeof EVENTS_TABLE>,
): Promise<EntityAlert | null> {
  const { entity_kind, entity_id, scan_at } = source

  if (entity_kind === 'endpoint') {
    const alert = interpretEvent(source)

    return alert !== null && source.type === 'ADD'
      ? { ...alert, previously_known: (await earlierObservations(ctx, source).first()) !== null }
      : alert
  }

  // Parent lifecycle belongs to observations, including transitions with no Event.
  if (source.type !== 'UPDATE') {
    return null
  }

  const before = await earlierObservations(ctx, source).order('desc').first()

  const at = await ctx.db
    .query(OBSERVATIONS_TABLE)
    .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).eq('scan_at', scan_at),
    )
    .unique()

  return serving(before) && serving(at ?? before) ? interpretEvent(source) : null
}

/** The latest Event naming this parent, which carries its historical identity. */
async function relatedEvent(
  ctx: QueryCtx,
  entity_kind: 'model' | 'provider',
  entity_id: string,
  scan_at: string,
) {
  const events =
    entity_kind === 'model'
      ? ctx.db
          .query(EVENTS_TABLE)
          .withIndex('by_model_id_and_scan_at', (q) =>
            q.eq('context.model.model_id', entity_id).lte('scan_at', scan_at),
          )
      : ctx.db
          .query(EVENTS_TABLE)
          .withIndex('by_provider_id_and_scan_at', (q) =>
            q.eq('context.provider.provider_id', entity_id).lte('scan_at', scan_at),
          )

  return await events.order('desc').first()
}

async function interpretObservation(
  ctx: QueryCtx,
  source: ObservationRow,
): Promise<EntityAlert | null> {
  if (source.entity_kind === 'endpoint') {
    return null
  }

  // The pair's own counts decide the transition; earlier pairs may still be ingesting.
  // A baseline row has no comparison, so it announces nothing.
  const { entity_kind, entity_id, scan_at, endpoint_count, previous_endpoint_count } = source

  if (previous_endpoint_count === null || endpoint_count > 0 === previous_endpoint_count > 0) {
    return null
  }

  const added = endpoint_count > 0

  const event = await ctx.db
    .query(EVENTS_TABLE)
    .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).lte('scan_at', scan_at),
    )
    .order('desc')
    .first()

  const related =
    event?.scan_at === scan_at ? event : await relatedEvent(ctx, entity_kind, entity_id, scan_at)

  const snapshot =
    event?.scan_at === scan_at && event.type === (added ? 'ADD' : 'REMOVE')
      ? interpretEvent(event)
      : null

  const known = added ? (await earlierObservations(ctx, source).first()) !== null : undefined

  const fields = {
    entity_id,
    observed_at: scan_at,
    ...R.pickBy({ previously_known: known }, R.isDefined),
  }

  return entity_kind === 'model'
    ? modelAlert(fields, added, related, snapshot)
    : providerAlert(fields, added, related, snapshot)
}

type AlertFields = { entity_id: string; observed_at: string; previously_known?: boolean }

type RelatedEvent = Doc<typeof EVENTS_TABLE> | null

// Observations retain no metadata snapshot. Use historical identity or the identifier,
// and show details only when an Event captured the matching lifecycle snapshot.
function modelAlert(
  fields: AlertFields,
  added: boolean,
  related: RelatedEvent,
  snapshot: EntityAlert | null,
): EntityAlert {
  const context = {
    model:
      related !== null && related.entity_kind !== 'provider'
        ? related.context.model
        : { display_name: fields.entity_id, model_id: fields.entity_id },
  }

  return added
    ? {
        ...fields,
        after: snapshot !== null && 'after' in snapshot ? snapshot.after : [],
        context,
        entity_kind: 'model',
        type: 'model_added',
      }
    : {
        ...fields,
        before: snapshot !== null && 'before' in snapshot ? snapshot.before : [],
        context,
        entity_kind: 'model',
        type: 'model_removed',
      }
}

function providerAlert(
  fields: AlertFields,
  added: boolean,
  related: RelatedEvent,
  snapshot: EntityAlert | null,
): EntityAlert {
  const context = {
    provider:
      related !== null && related.entity_kind !== 'model'
        ? related.context.provider
        : { display_name: fields.entity_id, provider_id: fields.entity_id },
  }

  return added
    ? {
        ...fields,
        after: snapshot !== null && 'after' in snapshot ? snapshot.after : [],
        context,
        entity_kind: 'provider',
        type: 'provider_added',
      }
    : {
        ...fields,
        before: snapshot !== null && 'before' in snapshot ? snapshot.before : [],
        context,
        entity_kind: 'provider',
        type: 'provider_removed',
      }
}
