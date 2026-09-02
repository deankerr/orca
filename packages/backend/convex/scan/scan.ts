import { asyncMap } from 'convex-helpers'
import * as R from 'remeda'
import { up } from 'up-fetch'
import { z } from 'zod'

import { IdentifiedEndpoint, IdentifiedModel } from './schema'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

export async function scan() {
  const catalog = await fetchCatalogModels()

  const entries = await asyncMap(catalog, async ({ endpoint, ...model }) => {
    if (endpoint === null) {
      return {
        model_id: model.slug,
        variant: 'standard',
        model,
        endpoints: null,
      }
    }

    const endpoints = await fetchEndpoints(model.permaslug, endpoint.variant)

    return {
      model_id: endpoint.model_variant_slug,
      variant: endpoint.variant,
      model,
      endpoints: R.sortBy(endpoints, R.prop('id')),
    }
  })

  return R.sortBy(entries, R.prop('model_id'))
}

async function fetchCatalogModels() {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: z.object({
      data: z
        .looseObject({
          ...IdentifiedModel.shape,
          endpoint: z
            .object({
              model_variant_slug: z.string(),
              variant: z.string(),
            })
            .nullable(),
        })
        .array(),
    }),
  })

  // Exclude "latest" model aliases
  return data.filter((model) => !model.slug.startsWith('~'))
}

async function fetchEndpoints(permaslug: string, variant: string) {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params: { permaslug, variant },
    schema: z.object({
      data: IdentifiedEndpoint.array(),
    }),
  })

  return data.map(R.omit(['model']))
}
