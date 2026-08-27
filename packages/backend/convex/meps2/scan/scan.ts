import { asyncMap } from 'convex-helpers'
import * as R from 'remeda'
import { up } from 'up-fetch'
import { z } from 'zod'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

const ModelRecord = z.looseObject({
  slug: z.string(),
  permaslug: z.string(),
  input_modalities: z.string().array(),
  output_modalities: z.string().array(),
  endpoint: z
    .looseObject({
      id: z.string(),
      model_variant_slug: z.string(),
      variant: z.string(),
    })
    .nullable(),
})

const ModelCatalogData = z.object({
  data: z.array(ModelRecord),
})

export async function fetchModels() {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: ModelCatalogData,
  })

  return data.filter(
    (model) =>
      !model.slug.startsWith('~') &&
      model.input_modalities.includes('text') &&
      model.output_modalities.includes('text'),
  )
}

const EndpointRecord = z.looseObject({
  id: z.string(),
  model_variant_slug: z.string(),
})

const EndpointsData = z.object({ data: z.array(EndpointRecord) })

async function fetchEndpoints(params: { permaslug: string; variant: string }) {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params,
    schema: EndpointsData,
  })

  return data
}

export async function scanCatalog() {
  const run_at = new Date().toISOString()

  const models = await fetchModels()

  const data = await asyncMap(models, async (model) => {
    const { endpoint } = model

    // lack of an embedded "top" endpoint means there are no available endpoints
    if (endpoint === null) {
      return {
        model_id: model.slug,
        model,
        endpoints: null,
        variant: 'standard',
      }
    }

    const endpoints = await fetchEndpoints({
      permaslug: model.permaslug,
      variant: endpoint.variant,
    })

    return {
      model_id: endpoint.model_variant_slug,
      variant: endpoint.variant,

      // replace duplicated endpoint data with reference to endpoints array
      model: {
        ...model,
        endpoint: endpoint.id,
      },
      // strip duplicated model data
      endpoints: endpoints.map(R.omit(['model'])),
    }
  })

  return {
    run_at,
    bundle_format: 'catalog-v1',
    data,
  }
}
export type CatalogV1 = ReturnType<typeof scanCatalog>
