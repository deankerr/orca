import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { modelsTable } from '../../tables/models'
import { tableHasRows, upsertResult } from './helpers'

/**
 * Whether the models view has any rows. Empty means rewrite `after` as upserts.
 */
export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_models'),
})

/**
 * Insert or replace model view rows. Catalog-absent models are not deleted.
 */
export const upsert = internalMutation({
  args: { upserts: v.array(modelsTable.validator) },
  returns: upsertResult,
  handler: async (ctx, args) => {
    let upserted = 0

    for (const model of args.upserts) {
      const existing = await ctx.db
        .query('meps2_models')
        .withIndex('by_model_id', (q) => q.eq('model_id', model.model_id))
        .unique()

      await (existing === null
        ? ctx.db.insert('meps2_models', model)
        : ctx.db.replace(existing._id, model))
      upserted += 1
    }

    return { upserted }
  },
})
