import * as R from 'remeda'

import { internalMutation } from '../_generated/server'

const SAMPLE_LIMIT = 20

const takeRandomSample = <T>(items: T[], limit = SAMPLE_LIMIT) => {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]

    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled.slice(0, limit)
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query('or_views_models').collect()
    const providers = await ctx.db.query('or_views_providers').collect()
    const endpoints = await ctx.db.query('or_views_endpoints').collect()

    const availableModels = models.filter((model) => model.unavailable_at === undefined)
    const availableProviders = providers.filter((provider) => provider.unavailable_at === undefined)
    const availableEndpoints = endpoints.filter((endpoint) => endpoint.unavailable_at === undefined)

    return {
      counts: {
        models: {
          total: models.length,
          available: availableModels.length,
          unavailable: models.length - availableModels.length,
        },
        providers: {
          total: providers.length,
          available: availableProviders.length,
          unavailable: providers.length - availableProviders.length,
        },
        endpoints: {
          total: endpoints.length,
          available: availableEndpoints.length,
          unavailable: endpoints.length - availableEndpoints.length,
        },
      },
      samples: {
        endpoints: takeRandomSample(endpoints).map((endpoint) => ({
          modelSlug: endpoint.model.slug,
          providerSlug: endpoint.provider.slug,
          providerTagSlug: endpoint.provider.tag_slug,
          available: endpoint.unavailable_at === undefined,
        })),
      },
      notes: {
        sampleLimit: SAMPLE_LIMIT,
        sampleStrategy: 'random endpoint sample across all endpoints',
      },
    }
  },
})

export const endpointCountFrequency = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query('or_views_models').collect()
    const endpoints = await ctx.db.query('or_views_endpoints').collect()

    const availableModelSlugs = new Set(
      models.filter((model) => model.unavailable_at === undefined).map((model) => model.slug),
    )
    const endpointCountsByModel = new Map(
      [...availableModelSlugs].map((modelSlug) => [modelSlug, 0]),
    )

    for (const endpoint of endpoints) {
      if (endpoint.unavailable_at !== undefined || !availableModelSlugs.has(endpoint.model.slug)) {
        continue
      }

      endpointCountsByModel.set(
        endpoint.model.slug,
        (endpointCountsByModel.get(endpoint.model.slug) ?? 0) + 1,
      )
    }

    const activeEndpointCounts = [...endpointCountsByModel.values()].filter((count) => count > 0)
    const frequency = R.pipe(
      activeEndpointCounts,
      R.countBy(String),
      R.entries(),
      R.map(([endpointCount, modelCount]) => ({
        endpointCount: Number(endpointCount),
        modelCount,
      })),
      R.sortBy(({ endpointCount }) => endpointCount),
    )
    return {
      availableModelCount: availableModelSlugs.size,
      activeModelCount: activeEndpointCounts.length,
      activeEndpointCount: R.sum(activeEndpointCounts),
      frequency,
    }
  },
})

export const activeModelCreatedAtFrequency = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query('or_views_models').collect()
    const endpoints = await ctx.db.query('or_views_endpoints').collect()

    const activeEndpointModelSlugs = new Set(
      endpoints
        .filter((endpoint) => endpoint.unavailable_at === undefined)
        .map((endpoint) => endpoint.model.slug),
    )
    const activeModels = models.filter(
      (model) => model.unavailable_at === undefined && activeEndpointModelSlugs.has(model.slug),
    )
    const frequency = R.pipe(
      activeModels,
      R.countBy((model) => new Date(model.or_added_at).toISOString().slice(0, 7)),
      R.entries(),
      R.map(([yearMonth, modelCount]) => ({ yearMonth, modelCount })),
      R.sortBy(({ yearMonth }) => yearMonth),
    )

    return {
      activeModelCount: activeModels.length,
      frequency,
    }
  },
})
