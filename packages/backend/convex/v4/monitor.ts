import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { query } from '../_generated/server'
import { entityAlert } from './alerts/curate'
import { forMonitor } from './alerts/pipelines'
import { V4_CURRENT_MODELS_TABLE } from './catalog/models/table'
import { V4_CURRENT_PROVIDERS_TABLE } from './catalog/providers/table'
import { V4_EVENTS_TABLE } from './events/table'
import { V4_ENDPOINT_LISTINGS_TABLE } from './history/listings/table'

const scope = v.union(
  v.object({ kind: v.literal('all') }),
  v.object({ kind: v.literal('model'), model_id: v.string() }),
  v.object({ kind: v.literal('provider'), provider_id: v.string() }),
  v.object({ kind: v.literal('pair'), model_id: v.string(), provider_id: v.string() }),
  v.object({ kind: v.literal('endpoint'), endpoint_id: v.string() }),
)
export type MonitorScope = Infer<typeof scope>

/** Historical activity, selected using the relationships captured with each event. */
export const feed = query({
  args: { scope, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(entityAlert),
  handler: async (ctx, { scope: selected, paginationOpts }) => {
    const events = ctx.db.query(V4_EVENTS_TABLE)

    const source =
      selected.kind === 'endpoint'
        ? events.withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
            q.eq('entity_kind', 'endpoint').eq('entity_id', selected.endpoint_id),
          )
        : selected.kind === 'model' || selected.kind === 'pair'
          ? events.withIndex('by_model_id_and_scan_at', (q) =>
              q.eq('context.model.model_id', selected.model_id),
            )
          : selected.kind === 'provider'
            ? events.withIndex('by_provider_id_and_scan_at', (q) =>
                q.eq('context.provider.provider_id', selected.provider_id),
              )
            : events.withIndex('by_scan_at')

    const result = await source.order('desc').paginate(paginationOpts)

    return {
      ...result,
      page: result.page.flatMap((row) => {
        // ponytail: pair scopes scan model activity; add a compound index if sparse histories become costly.
        // Preserve continuation across nonmatching pages.
        if (
          selected.kind === 'pair' &&
          (row.entity_kind !== 'endpoint' ||
            row.context.provider.provider_id !== selected.provider_id)
        ) {
          return []
        }

        const event = forMonitor(row)
        return event === null ? [] : [event]
      }),
    }
  },
})

const choice = v.object({ id: v.string(), name: v.string() })

/** Only models with observed endpoints; history keeps departed models selectable. */
export const models = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(choice.extend({ permaslug: v.string(), variant: v.string() })),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id')
      .paginate(paginationOpts)

    const choices = await Promise.all(
      result.page.map(async (row) => {
        if (row.model_id.startsWith('openrouter/')) {
          return null
        }

        const endpoint = await ctx.db
          .query(V4_ENDPOINT_LISTINGS_TABLE)
          .withIndex('by_model_id_and_scan_at', (q) => q.eq('model_id', row.model_id))
          .first()

        return endpoint === null
          ? null
          : {
              id: row.model_id,
              name: row.display_name,
              permaslug: row.permaslug,
              variant: row.variant,
            }
      }),
    )

    return {
      ...result,
      page: choices.filter((choice) => choice !== null),
    }
  },
})

/** Providers use their explicit identity, independently of endpoint tags. */
export const providers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(choice),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(V4_CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id')
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((row) => ({ id: row.provider_id, name: row.display_name })),
    }
  },
})
