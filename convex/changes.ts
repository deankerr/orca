import { v } from 'convex/values'

import { query } from './_generated/server'

export const getModelChanges = query({
  args: { modelSlug: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const allChanges = await ctx.db
      .query('or_views_changes')
      .withIndex('by_entity_type__crawl_id', (q) => q.eq('entity_type', 'model'))
      .order('desc')
      .collect()

    return allChanges
      .filter((change) => change.entity_type === 'model' && change.model_slug === args.modelSlug)
      .slice(0, args.limit)
  },
})

export const getProviderChanges = query({
  args: { providerSlug: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const allChanges = await ctx.db
      .query('or_views_changes')
      .withIndex('by_entity_type__crawl_id', (q) => q.eq('entity_type', 'provider'))
      .order('desc')
      .collect()

    return allChanges
      .filter(
        (change) => change.entity_type === 'provider' && change.provider_slug === args.providerSlug,
      )
      .slice(0, args.limit)
  },
})
