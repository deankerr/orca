import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { endpointsTable } from '../../tables/endpoints'
import { pricingTable } from '../../tables/pricing'
import { statsTable } from '../../tables/stats'
import { appendResult, insertRows, tableHasRows } from './helpers'

export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_endpoints'),
})

export const apply = internalMutation({
  args: {
    upserts: v.array(endpointsTable.validator),
  },
  returns: v.object({ upserted: v.number() }),
  handler: async (ctx, args) => {
    let upserted = 0

    for (const endpoint of args.upserts) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint.endpoint_id))
        .first()

      // replace omits unlisted_at, which clears it on relist
      await (existing
        ? ctx.db.replace(existing._id, endpoint)
        : ctx.db.insert('meps2_endpoints', endpoint))
      upserted += 1
    }

    return { upserted }
  },
})

export const unlist = internalMutation({
  args: {
    endpoint_ids: v.array(v.string()),
    unlisted_at: v.number(),
  },
  returns: v.object({ unlisted: v.number() }),
  handler: async (ctx, args) => {
    let unlisted = 0

    for (const endpoint_id of args.endpoint_ids) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint_id))
        .first()
      if (existing === null || existing.unlisted_at !== undefined) {
        continue
      }

      await ctx.db.patch(existing._id, {
        unlisted_at: args.unlisted_at,
        updated_at: args.unlisted_at,
      })
      unlisted += 1
    }

    return { unlisted }
  },
})

export const appendStats = internalMutation({
  args: {
    rows: v.array(statsTable.validator),
  },
  returns: appendResult,
  handler: async (ctx, args) => await insertRows(ctx, 'meps2_stats', args.rows),
})

export const appendPricing = internalMutation({
  args: {
    rows: v.array(pricingTable.validator),
  },
  returns: appendResult,
  handler: async (ctx, args) => await insertRows(ctx, 'meps2_pricing', args.rows),
})
