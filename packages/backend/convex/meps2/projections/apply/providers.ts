import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { providersTable } from '../../tables/providers'
import { applyResult, tableHasRows } from './helpers'

export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_providers'),
})

export const apply = internalMutation({
  args: {
    upserts: v.array(providersTable.validator),
    deletes: v.array(v.string()),
  },
  returns: applyResult,
  handler: async (ctx, args) => {
    let upserted = 0
    let deleted = 0

    for (const provider of args.upserts) {
      const existing = await ctx.db
        .query('meps2_providers')
        .withIndex('by_provider_id', (q) => q.eq('provider_id', provider.provider_id))
        .first()

      await (existing
        ? ctx.db.replace(existing._id, provider)
        : ctx.db.insert('meps2_providers', provider))
      upserted += 1
    }

    for (const provider_id of args.deletes) {
      const existing = await ctx.db
        .query('meps2_providers')
        .withIndex('by_provider_id', (q) => q.eq('provider_id', provider_id))
        .first()
      if (existing) {
        await ctx.db.delete('meps2_providers', existing._id)
        deleted += 1
      }
    }

    return { upserted, deleted }
  },
})
