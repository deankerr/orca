import { internalMutation } from '../../_generated/server'
import { endpointsTable } from '../tables/endpoints'
import { modelsTable } from '../tables/models'
import { providersTable } from '../tables/providers'

export const upsertModel = internalMutation({
  args: {
    model: modelsTable.validator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('meps2_models')
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model.model_id))
      .first()

    if (existing) {
      await ctx.db.replace('meps2_models', existing._id, args.model)
      return existing._id
    }

    return await ctx.db.insert('meps2_models', args.model)
  },
})

export const upsertEndpoint = internalMutation({
  args: {
    endpoint: endpointsTable.validator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('meps2_endpoints')
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', args.endpoint.endpoint_id))
      .first()

    if (existing) {
      await ctx.db.replace('meps2_endpoints', existing._id, args.endpoint)
      return existing._id
    }

    return await ctx.db.insert('meps2_endpoints', args.endpoint)
  },
})

export const upsertProvider = internalMutation({
  args: {
    provider: providersTable.validator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('meps2_providers')
      .withIndex('by_provider_id', (q) => q.eq('provider_id', args.provider.provider_id))
      .first()

    if (existing) {
      await ctx.db.replace('meps2_providers', existing._id, args.provider)
      return existing._id
    }

    return await ctx.db.insert('meps2_providers', args.provider)
  },
})

export const dev_wipeModels = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const doc of ctx.db.query('meps2_models')) {
      await ctx.db.delete('meps2_models', doc._id)
    }
  },
})

export const dev_wipeEndpoints = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const doc of ctx.db.query('meps2_endpoints')) {
      await ctx.db.delete('meps2_endpoints', doc._id)
    }
  },
})

export const dev_wipeProviders = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const doc of ctx.db.query('meps2_providers')) {
      await ctx.db.delete('meps2_providers', doc._id)
    }
  },
})
