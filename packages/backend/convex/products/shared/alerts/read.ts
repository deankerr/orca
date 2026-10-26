import { mergedStream, stream } from 'convex-helpers/server/stream'
import type { QueryStream } from 'convex-helpers/server/stream'
import type { PaginationOptions } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import type { Doc } from '#generated/dataModel'
import type { QueryCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../../catalog/tables/observations'
import schema from '../../../schema'
import { cappedCutoff } from '../pagination'

export type EventScope =
  | { kind: 'all' }
  | { kind: 'model'; model_id: string }
  | { kind: 'provider'; provider_id: string }
  | { kind: 'pair'; model_id: string; provider_id: string }
  | { kind: 'entity'; entity_kind: 'model' | 'provider' | 'endpoint'; entity_id: string }

export type AlertSource = Doc<typeof EVENTS_TABLE> | Doc<typeof OBSERVATIONS_TABLE>

function scopedEvents(
  db: ReturnType<typeof stream<typeof schema>>,
  scope: EventScope,
  cutoff: string,
) {
  const events = db.query(EVENTS_TABLE)

  if (scope.kind === 'entity') {
    return events.withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q
        .eq('entity_kind', scope.entity_kind)
        .eq('entity_id', scope.entity_id)
        .lte('scan_at', cutoff),
    )
  }

  if (scope.kind === 'model' || scope.kind === 'pair') {
    return events.withIndex('by_model_id_and_scan_at', (q) =>
      q.eq('context.model.model_id', scope.model_id).lte('scan_at', cutoff),
    )
  }

  if (scope.kind === 'provider') {
    return events.withIndex('by_provider_id_and_scan_at', (q) =>
      q.eq('context.provider.provider_id', scope.provider_id).lte('scan_at', cutoff),
    )
  }

  return events.withIndex('by_scan_at', (q) => q.lte('scan_at', cutoff))
}

function scopeEntityId(scope: Extract<EventScope, { kind: 'model' | 'provider' }>): string {
  return scope.kind === 'model' ? scope.model_id : scope.provider_id
}

/** Merge indexed Catalog facts before pagination; interpretation may leave an empty page. */
export async function readPage(
  ctx: QueryCtx,
  scope: EventScope,
  paginationOpts: PaginationOptions,
) {
  const { cursor, endCursor, ...page } = paginationOpts

  const options = {
    ...page,
    cursor: cursor === null ? null : parseCursor(cursor),
    ...R.pickBy(
      {
        endCursor:
          endCursor === undefined || endCursor === null ? endCursor : parseCursor(endCursor),
      },
      R.isDefined,
    ),
  }

  const cutoff = await cappedCutoff(ctx)

  if (cutoff === null) {
    return { continueCursor: '', isDone: true, page: [] }
  }

  const db = stream(ctx.db, schema)
  const sources: QueryStream<AlertSource>[] = [scopedEvents(db, scope, cutoff).order('desc')]
  const observations = db.query(OBSERVATIONS_TABLE)

  if (scope.kind === 'all') {
    sources.push(
      observations.withIndex('by_scan_at', (q) => q.lte('scan_at', cutoff)).order('desc'),
    )
  } else if (
    scope.kind !== 'pair' &&
    !(scope.kind === 'entity' && scope.entity_kind === 'endpoint')
  ) {
    const kind = scope.kind === 'entity' ? scope.entity_kind : scope.kind
    const id = scope.kind === 'entity' ? scope.entity_id : scopeEntityId(scope)
    sources.push(
      observations
        .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
          q.eq('entity_kind', kind).eq('entity_id', id).lte('scan_at', cutoff),
        )
        .order('desc'),
    )
  }

  const result = await mergedStream(sources, ['scan_at', '_creationTime', '_id']).paginate(options)

  return {
    ...result,
    page:
      scope.kind === 'pair'
        ? result.page.filter(
            (row) =>
              'change_json' in row &&
              row.entity_kind === 'endpoint' &&
              row.context.provider.provider_id === scope.provider_id,
          )
        : result.page,
  }
}

const cursorKey = z.union([z.tuple([]), z.tuple([z.string(), z.number(), z.string()])])

function parseCursorKey(cursor: string) {
  try {
    return cursorKey.safeParse(JSON.parse(cursor))
  } catch {
    // A non-JSON cursor has no index key; report the same domain error as other invalid keys.
    return null
  }
}

/** These streams share the scan-time, creation-time, document-ID key, without equality prefixes. */
function parseCursor(cursor: string): string {
  const result = parseCursorKey(cursor)

  if (result?.success !== true) {
    throw new ConvexError('InvalidCursor: restart the feed without a cursor')
  }

  return JSON.stringify(result.data)
}
