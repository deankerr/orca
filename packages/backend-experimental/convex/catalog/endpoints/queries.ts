import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { endpointStatsApi } from '../../endpointStats/index'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

export async function getStateAt(ctx: QueryCtx, args: { id: string; observedAt?: number }) {
  return ctx.db
    .query('catalog_endpoints_state')
    .withIndex('by_entity_id__observedAt', (q) =>
      q.eq('entity.id', args.id).lte('observedAt', args.observedAt ?? Number.MAX_SAFE_INTEGER),
    )
    .order('desc')
    .first()
    .then((doc) => (doc ? { ...doc, isAvailable: doc.unavailableAt === undefined } : doc))
}

export const get = defineQuerySpec({
  args: { id: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query('catalog_endpoints_views')
      .withIndex('by_entityId', (q) => q.eq('id', args.id))
      .first(),
})

export const list = defineQuerySpec({
  args: { unavailableSince: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const threshold = args.unavailableSince ?? Number.MAX_SAFE_INTEGER
    const endpoints = await ctx.db
      .query('catalog_endpoints_views')
      .withIndex('by_unavailableAtSortKey', (q) => q.gte('unavailableAtSortKey', threshold))
      .collect()

    return Promise.all(
      endpoints.map(async (endpoint) => ({
        ...endpoint,
        stats: await endpointStatsApi.get.handler(ctx, { endpointId: endpoint.id }),
      })),
    )
  },
})

export const listForModel = defineQuerySpec({
  args: {
    modelId: v.string(),
    unavailableSince: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threshold = args.unavailableSince ?? Number.MAX_SAFE_INTEGER
    return ctx.db
      .query('catalog_endpoints_views')
      .withIndex('by_modelId__unavailableAtSortKey', (q) =>
        q.eq('modelId', args.modelId).gte('unavailableAtSortKey', threshold),
      )
      .collect()
  },
})

export const listStates = defineQuerySpec({
  args: {},
  handler: async (ctx) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints_state')
      .withIndex('by_entity_id__observedAt')
      .order('desc')
      .distinct(['entity.id'])
      .map(async (doc) => ({ ...doc, isAvailable: doc.unavailableAt === undefined }))
      .collect(),
})

export const history = defineQuerySpec({
  args: {
    id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints_state')
      .withIndex('by_entity_id__observedAt', (q) => q.eq('entity.id', args.id))
      .order('desc')
      .map(async (state) => {
        const snapshot = await ctx.db.get(state.snapshotId)

        if (!snapshot) {
          throw new ConvexError({
            id: state.entity.id,
            message: 'snapshot not found',
            snapshotId: state.snapshotId,
          })
        }

        return { snapshot, state }
      })
      .paginate(args.paginationOpts),
})
