import { docValidator, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import type { PaginationOptions } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import type { QueryCtx } from '../../_generated/server'
import { eventsTable, V4_EVENTS_TABLE } from '../../events/table'

export type EventScope =
  | { kind: 'all' }
  | { kind: 'model'; model_id: string }
  | { kind: 'provider'; provider_id: string }
  | { kind: 'pair'; model_id: string; provider_id: string }
  | { kind: 'entity'; entity_kind: 'model' | 'provider' | 'endpoint'; entity_id: string }

/** Read captured identity relationships and retain native pagination, including empty pages. */
export async function readPage(
  ctx: QueryCtx,
  scope: EventScope,
  paginationOpts: PaginationOptions,
) {
  const events = ctx.db.query(V4_EVENTS_TABLE)

  const source =
    scope.kind === 'entity'
      ? events.withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
          q.eq('entity_kind', scope.entity_kind).eq('entity_id', scope.entity_id),
        )
      : scope.kind === 'model' || scope.kind === 'pair'
        ? events.withIndex('by_model_id_and_scan_at', (q) =>
            q.eq('context.model.model_id', scope.model_id),
          )
        : scope.kind === 'provider'
          ? events.withIndex('by_provider_id_and_scan_at', (q) =>
              q.eq('context.provider.provider_id', scope.provider_id),
            )
          : events.withIndex('by_scan_at')

  const result = await source.order('desc').paginate(paginationOpts)

  // ponytail: pair scopes scan model activity; add a compound index if sparse histories become costly.
  return scope.kind === 'pair'
    ? {
        ...result,
        page: result.page.filter(
          (row) =>
            row.entity_kind === 'endpoint' &&
            row.context.provider.provider_id === scope.provider_id,
        ),
      }
    : result
}

/** One captured event for manually triggered delivery. */
export const get = internalQuery({
  args: { event_id: v.id(V4_EVENTS_TABLE) },
  returns: v.union(docValidator(V4_EVENTS_TABLE, eventsTable), v.null()),
  handler: async (ctx, args) => await ctx.db.get(V4_EVENTS_TABLE, args.event_id),
})

/** Recent captured events for operator replay. */
export const list = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(docValidator(V4_EVENTS_TABLE, eventsTable)),
  handler: async (ctx, { paginationOpts }) => await readPage(ctx, { kind: 'all' }, paginationOpts),
})
