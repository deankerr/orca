import { zodOutputToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'

import { query } from '#generated/server'

import { CURRENT_ENDPOINTS_TABLE } from '../../catalog/tables/current'
import { Endpoint } from '../shared/endpoint'

/** Current or last-known endpoint. */
export const get = query({
  args: { endpoint_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', args.endpoint_id))
      .unique()

    return row === null ? null : Endpoint.parse(row)
  },
  returns: v.union(v.null(), zodOutputToConvex(Endpoint)),
})

/** Current endpoints for one model. */
export const byModel = query({
  args: { model_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .collect()

    return rows.map((row) => Endpoint.parse(row))
  },
  returns: v.array(zodOutputToConvex(Endpoint)),
})

/** Current endpoints for one provider and model. */
export const byProviderModel = query({
  args: { model_id: v.string(), provider_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_provider_id_and_model_id', (q) =>
        q.eq('provider_id', args.provider_id).eq('model_id', args.model_id),
      )
      .collect()

    return rows.map((row) => Endpoint.parse(row))
  },
  returns: v.array(zodOutputToConvex(Endpoint)),
})
