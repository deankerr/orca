import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../_generated/server'
import { endpointsTable } from '../tables/endpoints'
import { modelsTable } from '../tables/models'
import { pricingTable } from '../tables/pricing'
import { providersTable } from '../tables/providers'
import { statsTable } from '../tables/stats'

const applyResult = v.object({ upserted: v.number(), deleted: v.number() })

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

export const hasProjectedModels = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await ctx.db.query('meps2_models').first()) !== null,
})

export const applyModels = internalMutation({
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

      await (existing
        ? ctx.db.replace('meps2_models', existing._id, model)
        : ctx.db.insert('meps2_models', model))
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

export const applyEndpoints = internalMutation({
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
        ? ctx.db.replace('meps2_endpoints', existing._id, endpoint)
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
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0

    for (const row of args.rows) {
      await ctx.db.insert('meps2_stats', row)
      inserted += 1
    }

    return { inserted }
  },
})

export const appendPricing = internalMutation({
  args: {
    rows: v.array(pricingTable.validator),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0

    for (const row of args.rows) {
      await ctx.db.insert('meps2_pricing', row)
      inserted += 1
    }

    return { inserted }
  },
})

export const applyProviders = internalMutation({
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
        ? ctx.db.replace('meps2_providers', existing._id, provider)
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
