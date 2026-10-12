import type { QueryCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../../catalog/tables/observations'
import type { ObservationRow } from '../../../catalog/tables/observations'
import { INGESTIONS_TABLE } from '../../../ingestion/table'
import type { EntityAlert } from './curate'
import { interpretEvent } from './prepare'
import type { AlertSource } from './read'

function serving(row: ObservationRow | null): boolean {
  return row !== null && (row.entity_kind === 'endpoint' ? row.detected : row.endpoint_count > 0)
}

/** Historical classification uses only knowledge strictly earlier than this occurrence. */
export async function interpret(ctx: QueryCtx, source: AlertSource): Promise<EntityAlert | null> {
  const { entity_kind, entity_id, scan_at } = source

  if (!('change_json' in source) && entity_kind === 'endpoint') {
    return null
  }

  const history = () =>
    ctx.db
      .query(OBSERVATIONS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).lt('scan_at', scan_at),
      )

  if ('change_json' in source) {
    if (entity_kind === 'endpoint') {
      const alert = interpretEvent(source)
      return alert !== null && source.type === 'ADD'
        ? { ...alert, previously_known: (await history().first()) !== null }
        : alert
    }

    // Parent lifecycle belongs to observations, including transitions with no Event.
    if (source.type !== 'UPDATE') {
      return null
    }

    const before = await history().order('desc').first()
    const at = await ctx.db
      .query(OBSERVATIONS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).eq('scan_at', scan_at),
      )
      .unique()

    return serving(before) && serving(at ?? before) ? interpretEvent(source) : null
  }

  const before = await history().order('desc').first()
  const added = serving(source)

  if (added === serving(before)) {
    return null
  }

  const ingestion = await ctx.db
    .query(INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))
    .unique()

  if (ingestion === null || ingestion.from_scan_at === null) {
    return null
  }

  const event = await ctx.db
    .query(EVENTS_TABLE)
    .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q.eq('entity_kind', entity_kind).eq('entity_id', entity_id).lte('scan_at', scan_at),
    )
    .order('desc')
    .first()
  const related =
    event?.scan_at === scan_at
      ? event
      : await (
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
        )
          .order('desc')
          .first()
  const snapshot =
    event?.scan_at === scan_at && event.type === (added ? 'ADD' : 'REMOVE')
      ? interpretEvent(event)
      : null
  const known = added ? (await history().first()) !== null : undefined
  const fields = {
    entity_id,
    observed_at: scan_at,
    ...(known === undefined ? {} : { previously_known: known }),
  }

  // Observations retain no metadata snapshot. Use historical identity or the identifier,
  // and show details only when an Event captured the matching lifecycle snapshot.
  if (entity_kind === 'model') {
    const context = {
      model:
        related !== null && related.entity_kind !== 'provider'
          ? related.context.model
          : { model_id: entity_id, display_name: entity_id },
    }
    return added
      ? {
          ...fields,
          entity_kind,
          context,
          type: 'model_added',
          after: snapshot !== null && 'after' in snapshot ? snapshot.after : {},
        }
      : {
          ...fields,
          entity_kind,
          context,
          type: 'model_removed',
          before: snapshot !== null && 'before' in snapshot ? snapshot.before : {},
        }
  }

  const context = {
    provider:
      related !== null && related.entity_kind !== 'model'
        ? related.context.provider
        : { provider_id: entity_id, display_name: entity_id },
  }
  return added
    ? {
        ...fields,
        entity_kind: 'provider',
        context,
        type: 'provider_added',
        after: snapshot !== null && 'after' in snapshot ? snapshot.after : {},
      }
    : {
        ...fields,
        entity_kind: 'provider',
        context,
        type: 'provider_removed',
        before: snapshot !== null && 'before' in snapshot ? snapshot.before : {},
      }
}
