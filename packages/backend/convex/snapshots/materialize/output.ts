import { v } from 'convex/values'
import { diff } from 'json-diff-ts'

import { internalMutation } from '../../_generated/server'
import { endpointsSchema } from '../../catalog/endpoints'
import { modelsSchema } from '../../catalog/models'
import { providersSchema } from '../../catalog/providers'

const vUpsertModel = modelsSchema.table.validator.omit('updated_at')
const vUpsertModelDescription = modelsSchema.descriptions.table.validator.omit('updated_at')
const vUpsertEndpoint = endpointsSchema.table.validator.omit('updated_at')
const vUpsertProvider = providersSchema.table.validator.omit('updated_at')

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
    modelDescriptions: v.array(vUpsertModelDescription),
    endpoints: v.array(vUpsertEndpoint),
    providers: v.array(vUpsertProvider),
    crawl_id: v.string(),
    failedModelKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const failedModelKeys = new Set(args.failedModelKeys)
    // * run all entity upserts in parallel
    const [models, modelDescriptions, endpoints, providers] = await Promise.all([
      upsertModels(),
      upsertModelDescriptions(),
      upsertEndpoints(),
      upsertProviders(),
    ])

    console.log(`[materialize:upsert]`, { models, modelDescriptions, endpoints, providers })

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
              unavailable_at: Math.trunc(Number(args.crawl_id)),
            }),
          )
          counters.unavailable += 1
        }
      }

      return counters
    }

    async function upsertModelDescriptions() {
      const counters = { stable: 0, update: 0, insert: 0 }

      const currentDescriptions = await ctx.db.query('or_views_model_descriptions').collect()
      const currentDescriptionsMap = new Map(currentDescriptions.map((d) => [d.slug, d]))

      for (const description of args.modelDescriptions) {
        const currentDescription = currentDescriptionsMap.get(description.slug)

        if (currentDescription) {
          if (currentDescription.description === description.description) {
            counters.stable += 1
          } else {
            await ctx.db.replace(currentDescription._id, withUpdatedAt(description))
            counters.update += 1
          }
        } else {
          await ctx.db.insert('or_views_model_descriptions', withUpdatedAt(description))
          counters.insert += 1
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
              unavailable_at: Math.trunc(Number(args.crawl_id)),
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
              unavailable_at: Math.trunc(Number(args.crawl_id)),
            }),
          )
          counters.unavailable += 1
        }
      }

      return counters
    }
  },
})
