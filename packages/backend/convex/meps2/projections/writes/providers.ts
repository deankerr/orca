import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { providersTable } from '../../tables/providers'
import { tableHasRows, upsertResult } from './helpers'

/**
 * Whether the providers view has any rows. Empty means rewrite `after` as upserts.
 */
export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_providers'),
})

/**
 * Insert or replace provider view rows. Last write in the chunk wins for a slug.
 * Catalog-absent providers are not deleted.
 */
export const upsert = internalMutation({
  args: { upserts: v.array(providersTable.validator) },
  returns: upsertResult,
  handler: async (ctx, args) => {
    let upserted = 0

    for (const provider of args.upserts) {
      const existing = await ctx.db
        .query('meps2_providers')
        .withIndex('by_provider_id', (q) => q.eq('provider_id', provider.provider_id))
        .unique()

      await (existing === null
        ? ctx.db.insert('meps2_providers', provider)
        : ctx.db.replace(existing._id, provider))
      upserted += 1
    }

    return { upserted }
  },
})
