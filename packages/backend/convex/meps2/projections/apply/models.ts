import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { modelsTable } from '../../tables/models'
import { applyResult, tableHasRows } from './helpers'

export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_models'),
})

export const apply = internalMutation({
  args: {
    upserts: v.array(modelsTable.validator),
    deletes: v.array(v.string()),
  },
  returns: applyResult,
  handler: async (ctx, args) => {
    let upserted = 0
    let deleted = 0

    for (const model of args.upserts) {
      const existing = await ctx.db
        .query('meps2_models')
        .withIndex('by_model_id', (q) => q.eq('model_id', model.model_id))
        .first()

      await (existing ? ctx.db.replace(existing._id, model) : ctx.db.insert('meps2_models', model))
      upserted += 1
    }

    for (const model_id of args.deletes) {
      const existing = await ctx.db
        .query('meps2_models')
        .withIndex('by_model_id', (q) => q.eq('model_id', model_id))
        .first()
      if (existing) {
        await ctx.db.delete('meps2_models', existing._id)
        deleted += 1
      }
    }

    return { upserted, deleted }
  },
})
