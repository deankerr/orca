import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { endpointsTable } from '../../tables/endpoints'
import { pricingTable } from '../../tables/pricing'
import { statsTable } from '../../tables/stats'
import { appendResult, applyResult, insertRows, tableHasRows } from './helpers'

export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_endpoints'),
})

export const apply = internalMutation({
  args: {
    upserts: v.array(endpointsTable.validator),
    deletes: v.array(v.string()),
  },
  returns: applyResult,
  handler: async (ctx, args) => {
    let upserted = 0
    let deleted = 0

    for (const endpoint of args.upserts) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint.endpoint_id))
        .first()

      await (existing
        ? ctx.db.replace(existing._id, endpoint)
        : ctx.db.insert('meps2_endpoints', endpoint))
      upserted += 1
    }

    for (const endpoint_id of args.deletes) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint_id))
        .first()
      if (existing) {
        await ctx.db.delete('meps2_endpoints', existing._id)
        deleted += 1
      }
    }

    return { upserted, deleted }
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
