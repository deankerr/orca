import { v } from 'convex/values'
import { diff } from 'json-diff-ts'

import { endpointsTable } from '@/convex/catalog/endpoints'
import { modelsTable } from '@/convex/catalog/models'
import { providersTable } from '@/convex/catalog/providers'

import { internalMutation } from '../../_generated/server'

const vUpsertModel = modelsTable.validator.omit('updated_at')
const vUpsertEndpoint = endpointsTable.validator.omit('updated_at')
const vUpsertProvider = providersTable.validator.omit('updated_at')

const vSourceItem = v.object({
  key: v.string(),
  data: v.record(v.string(), v.any()),
})

function isEqual(from: Record<string, unknown>, to: Record<string, unknown>) {
  const changes = diff(from, to, {
    keysToSkip: ['_id', '_creationTime', 'updated_at'],
  })
  return changes.length === 0
}

function withUpdatedAt<T extends Record<string, unknown>>(value: T) {
  return {
    ...value,
    updated_at: Date.now(),
  }
}

export const upsert = internalMutation({
  args: {
    models: v.array(vUpsertModel),
    endpoints: v.array(vUpsertEndpoint),
    providers: v.array(vUpsertProvider),
    crawl_id: v.string(),
    failedModelKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const failedModelKeys = new Set(args.failedModelKeys)
    // * run all entity upserts in parallel
    const [models, endpoints, providers] = await Promise.all([
      upsertModels(),
      upsertEndpoints(),
      upsertProviders(),
    ])

    console.log(`[materialize:upsert]`, { models, endpoints, providers })

    // * models
    async function upsertModels() {
      const counters = { stable: 0, update: 0, insert: 0, unavailable: 0 }

      const currentModels = await ctx.db.query('or_views_models').collect()
      const currentModelsMap = new Map(currentModels.map((m) => [m.slug, m]))

      for (const model of args.models) {
        const currentModel = currentModelsMap.get(model.slug)

        if (currentModel) {
          currentModelsMap.delete(currentModel.slug)

          if (isEqual(currentModel, model)) {
            counters.stable += 1
          } else {
            await ctx.db.replace(currentModel._id, withUpdatedAt(model))
            counters.update += 1
          }
        } else {
          await ctx.db.insert('or_views_models', withUpdatedAt(model))
          counters.insert += 1
        }
      }

      // update unavailable_at for models that are no longer advertised
      // skip models whose endpoint fetch failed (model itself was fetched fine)
      for (const currentModel of currentModelsMap.values()) {
        if (currentModel.unavailable_at === undefined) {
          const modelKey = `${currentModel.version_slug}:${currentModel.variant}`
          if (failedModelKeys.has(modelKey)) {
            continue
          }

          await ctx.db.patch(
            currentModel._id,
            withUpdatedAt({
              unavailable_at: Number.parseInt(args.crawl_id, 10),
            }),
          )
          counters.unavailable += 1
        }
      }

      return counters
    }

    // * endpoints
    async function upsertEndpoints() {
      const counters = { stable: 0, update: 0, insert: 0, unavailable: 0 }

      const currentEndpoints = await ctx.db.query('or_views_endpoints').collect()
      const currentEndpointsMap = new Map(currentEndpoints.map((e) => [e.uuid, e]))

      for (const endpoint of args.endpoints) {
        const currentEndpoint = currentEndpointsMap.get(endpoint.uuid)

        if (currentEndpoint) {
          currentEndpointsMap.delete(currentEndpoint.uuid)

          if (isEqual(currentEndpoint, endpoint)) {
            counters.stable += 1
          } else {
            await ctx.db.replace(currentEndpoint._id, withUpdatedAt(endpoint))
            counters.update += 1
          }
        } else {
          await ctx.db.insert('or_views_endpoints', withUpdatedAt(endpoint))
          counters.insert += 1
        }
      }

      // update unavailable_at for endpoints that are no longer advertised
      // skip endpoints whose model had a fetch error (transient failure, not a real deletion)
      for (const currentEndpoint of currentEndpointsMap.values()) {
        if (currentEndpoint.unavailable_at === undefined) {
          const modelKey = `${currentEndpoint.model.version_slug}:${currentEndpoint.model.variant}`
          if (failedModelKeys.has(modelKey)) {
            continue
          }

          await ctx.db.patch(
            currentEndpoint._id,
            withUpdatedAt({
              unavailable_at: Number.parseInt(args.crawl_id, 10),
            }),
          )
          counters.unavailable += 1
        }
      }

      return counters
    }

    // * providers
    async function upsertProviders() {
      const counters = { stable: 0, update: 0, insert: 0, unavailable: 0 }

      const currentProviders = await ctx.db.query('or_views_providers').collect()
      const currentProvidersMap = new Map(currentProviders.map((p) => [p.slug, p]))

      for (const provider of args.providers) {
        const currentProvider = currentProvidersMap.get(provider.slug)

        if (currentProvider) {
          currentProvidersMap.delete(currentProvider.slug)

          if (isEqual(currentProvider, provider)) {
            counters.stable += 1
          } else {
            await ctx.db.replace(currentProvider._id, withUpdatedAt(provider))
            counters.update += 1
          }
        } else {
          await ctx.db.insert('or_views_providers', withUpdatedAt(provider))
          counters.insert += 1
        }
      }

      // update unavailable_at for providers that are no longer advertised
      for (const currentProvider of currentProvidersMap.values()) {
        if (currentProvider.unavailable_at === undefined) {
          await ctx.db.patch(
            currentProvider._id,
            withUpdatedAt({
              unavailable_at: Number.parseInt(args.crawl_id, 10),
            }),
          )
          counters.unavailable += 1
        }
      }

      return counters
    }
  },
})

const vEntityType = v.union(v.literal('model'), v.literal('endpoint'), v.literal('provider'))

export const upsertSources = internalMutation({
  args: {
    entityType: vEntityType,
    items: v.array(vSourceItem),
  },
  handler: async (ctx, args) => {
    const counters = { stable: 0, update: 0, insert: 0 }

    // * query only the sources for this entity type
    const currentSources = await ctx.db
      .query('or_sources')
      .withIndex('by_entity', (q) => q.eq('entity_type', args.entityType))
      .collect()
    const currentSourcesMap = new Map(currentSources.map((s) => [s.entity_key, s]))

    for (const item of args.items) {
      const currentSource = currentSourcesMap.get(item.key)

      if (currentSource) {
        if (isEqual(currentSource.data, item.data)) {
          counters.stable += 1
        } else {
          await ctx.db.replace(
            currentSource._id,
            withUpdatedAt({
              entity_type: args.entityType,
              entity_key: item.key,
              data: item.data,
            }),
          )
          counters.update += 1
        }
      } else {
        await ctx.db.insert(
          'or_sources',
          withUpdatedAt({
            entity_type: args.entityType,
            entity_key: item.key,
            data: item.data,
          }),
        )
        counters.insert += 1
      }
    }

    console.log(`[materialize:upsertSources:${args.entityType}]`, counters)
  },
})
