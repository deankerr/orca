import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { query } from '#generated/server'

import { CURRENT_MODELS_TABLE, CURRENT_PROVIDERS_TABLE } from '../../catalog/tables/current'
import { OBSERVATIONS_TABLE } from '../../catalog/tables/observations'
import { entityAlert } from '../shared/alerts/curate'
import { interpret } from '../shared/alerts/interpret'
import { selectDefault } from '../shared/alerts/prepare'
import { readPage } from '../shared/alerts/read'

const scope = v.union(
  v.object({ kind: v.literal('all') }),
  v.object({ kind: v.literal('model'), model_id: v.string() }),
  v.object({ kind: v.literal('provider'), provider_id: v.string() }),
  v.object({ kind: v.literal('pair'), model_id: v.string(), provider_id: v.string() }),
  v.object({ endpoint_id: v.string(), kind: v.literal('endpoint') }),
)

export type MonitorScope = Infer<typeof scope>

/** Historical activity, selected using the relationships captured with each event. */
export const feed = query({
  args: { paginationOpts: paginationOptsValidator, scope },
  handler: async (ctx, { scope: selected, paginationOpts }) => {
    const result = await readPage(
      ctx,
      selected.kind === 'endpoint'
        ? { entity_id: selected.endpoint_id, entity_kind: 'endpoint', kind: 'entity' }
        : selected,
      paginationOpts,
    )

    const alerts = await Promise.all(
      result.page.map(async (row) => selectDefault(await interpret(ctx, row))),
    )

    return { ...result, page: alerts.filter((alert) => alert !== null) }
  },
  returns: paginationResultValidator(entityAlert),
})

const choice = v.object({ id: v.string(), name: v.string() })

/** Only models with observed endpoints; history keeps departed models selectable. */
export const models = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(CURRENT_MODELS_TABLE)
      .withIndex('by_model_id')
      .paginate(paginationOpts)

    const choices = await Promise.all(
      result.page.map(async (row) => {
        if (row.model_id.startsWith('openrouter/')) {
          return null
        }

        const endpoint = await ctx.db
          .query(OBSERVATIONS_TABLE)
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
      page: choices.filter((entry) => entry !== null),
    }
  },
  returns: paginationResultValidator(choice.extend({ permaslug: v.string(), variant: v.string() })),
})

/** Providers use their explicit identity, independently of endpoint tags. */
export const providers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id')
      .paginate(paginationOpts)

    return {
      ...result,
      page: result.page.map((row) => ({ id: row.provider_id, name: row.display_name })),
    }
  },
  returns: paginationResultValidator(choice),
})
