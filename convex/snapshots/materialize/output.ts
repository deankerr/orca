import { v } from 'convex/values'

import { diff } from 'json-diff-ts'

import { db } from '@/convex/db'

import { internalMutation } from '../../_generated/server'

const vUpsertModel = db.or.views.models.vTable.validator.omit('updated_at')
const vUpsertEndpoint = db.or.views.endpoints.vTable.validator.omit('updated_at')
const vUpsertProvider = db.or.views.providers.vTable.validator.omit('updated_at')

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

export const upsert = internalMutation({
  args: {
    models: v.array(vUpsertModel),
    endpoints: v.array(vUpsertEndpoint),
    providers: v.array(vUpsertProvider),
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
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

      const currentModels = await db.or.views.models.collect(ctx)
      const currentModelsMap = new Map(currentModels.map((m) => [m.slug, m]))

      for (const model of args.models) {
        const currentModel = currentModelsMap.get(model.slug)

        if (currentModel) {
          currentModelsMap.delete(currentModel.slug)

          if (isEqual(currentModel, model)) {
            counters.stable++
          } else {
            await db.or.views.models.replace(ctx, currentModel._id, model)
            counters.update++
          }
        } else {
          await db.or.views.models.insert(ctx, model)
          counters.insert++
        }
      }

      // update unavailable_at for models that are no longer advertised
      for (const currentModel of currentModelsMap.values()) {
        if (currentModel.unavailable_at === undefined) {
          await db.or.views.models.patch(ctx, currentModel._id, {
            unavailable_at: parseInt(args.crawl_id),
          })
          counters.unavailable++
        }
      }

      return counters
    }

    // * endpoints
    async function upsertEndpoints() {
      const counters = { stable: 0, update: 0, insert: 0, unavailable: 0 }

      const currentEndpoints = await db.or.views.endpoints.collect(ctx)
      const currentEndpointsMap = new Map(currentEndpoints.map((e) => [e.uuid, e]))

      for (const endpoint of args.endpoints) {
        const currentEndpoint = currentEndpointsMap.get(endpoint.uuid)

        if (currentEndpoint) {
          currentEndpointsMap.delete(currentEndpoint.uuid)

          if (isEqual(currentEndpoint, endpoint)) {
            counters.stable++
          } else {
            await db.or.views.endpoints.replace(ctx, currentEndpoint._id, endpoint)
            counters.update++
          }
        } else {
          await db.or.views.endpoints.insert(ctx, endpoint)
          counters.insert++
        }
      }

      // update unavailable_at for endpoints that are no longer advertised
      for (const currentEndpoint of currentEndpointsMap.values()) {
        if (currentEndpoint.unavailable_at === undefined) {
          await db.or.views.endpoints.patch(ctx, currentEndpoint._id, {
            unavailable_at: parseInt(args.crawl_id),
          })
          counters.unavailable++
        }
      }

      return counters
    }

    // * providers
    async function upsertProviders() {
      const counters = { stable: 0, update: 0, insert: 0, unavailable: 0 }

      const currentProviders = await db.or.views.providers.collect(ctx)
      const currentProvidersMap = new Map(currentProviders.map((p) => [p.slug, p]))

      for (const provider of args.providers) {
        const currentProvider = currentProvidersMap.get(provider.slug)

        if (currentProvider) {
          currentProvidersMap.delete(currentProvider.slug)

          if (isEqual(currentProvider, provider)) {
            counters.stable++
          } else {
            await db.or.views.providers.replace(ctx, currentProvider._id, provider)
            counters.update++
          }
        } else {
          await db.or.views.providers.insert(ctx, provider)
          counters.insert++
        }
      }

      // update unavailable_at for providers that are no longer advertised
      for (const currentProvider of currentProvidersMap.values()) {
        if (currentProvider.unavailable_at === undefined) {
          await db.or.views.providers.patch(ctx, currentProvider._id, {
            unavailable_at: parseInt(args.crawl_id),
          })
          counters.unavailable++
        }
      }

      return counters
    }
  },
})

export const upsertSources = internalMutation({
  args: {
    sources: v.object({
      models: v.array(vSourceItem),
      endpoints: v.array(vSourceItem),
      providers: v.array(vSourceItem),
    }),
  },
  handler: async (ctx, args) => {
    const counters = { stable: 0, update: 0, insert: 0 }

    const currentSources = await db.or.sources.collect(ctx)
    const currentSourcesMap = new Map(
      currentSources.map((s) => [`${s.entity_type}:${s.entity_key}`, s]),
    )

    const allSourceItems = [
      ...args.sources.models.map((s) => ({ entity_type: 'model' as const, ...s })),
      ...args.sources.endpoints.map((s) => ({ entity_type: 'endpoint' as const, ...s })),
      ...args.sources.providers.map((s) => ({ entity_type: 'provider' as const, ...s })),
    ]

    for (const source of allSourceItems) {
      const compositeKey = `${source.entity_type}:${source.key}`
      const currentSource = currentSourcesMap.get(compositeKey)

      if (currentSource) {
        if (isEqual(currentSource.data, source.data)) {
          counters.stable++
        } else {
          await db.or.sources.replace(ctx, currentSource._id, {
            entity_type: source.entity_type,
            entity_key: source.key,
            data: source.data,
          })
          counters.update++
        }
      } else {
        await db.or.sources.insert(ctx, {
          entity_type: source.entity_type,
          entity_key: source.key,
          data: source.data,
        })
        counters.insert++
      }
    }

    console.log(`[materialize:upsertSources]`, counters)
  },
})
