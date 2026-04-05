import { db } from '@/convex/db'

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
    const models = await db.or.views.models.collect(ctx)
    const providers = await db.or.views.providers.collect(ctx)
    const endpoints = await db.or.views.endpoints.collect(ctx)

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
