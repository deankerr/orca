import { asyncMap } from 'convex-helpers'
import { up } from 'up-fetch'
import { z } from 'zod'

import type {
  Catalog,
  CatalogEndpoint,
  CatalogItem,
  CatalogModel,
  CatalogProvider,
} from './catalog'
import { Endpoint } from './schemas/endpoint'
import type { ModelRow } from './schemas/model'
import { Model } from './schemas/model'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

export async function fetchModels() {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: z.object({
      data: z.array(Model),
    }),
  })

  return data.filter(
    (model) =>
      !model.slug.startsWith('~') &&
      model.input_modalities.includes('text') &&
      model.output_modalities.includes('text'),
  )
}

async function fetchEndpoints(params: { permaslug: string; variant: string }) {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params,
    schema: z.object({ data: z.array(Endpoint) }),
  })

  return data
}

export async function scanCatalog() {
  const run_at = new Date().toISOString()
  const models = await fetchModels()

  const chunks = await asyncMap(models, async (model) => await scanModel(model))

  // last-write-wins on model_id / provider_id; sort so duplicate ids are deterministic across runs.

  const data = new Map<string, CatalogItem>()
  const providers = new Map<string, CatalogProvider>()

  for (const chunk of chunks.toSorted((left, right) =>
    left.item.model_id.localeCompare(right.item.model_id),
  )) {
    data.set(chunk.item.model_id, chunk.item)
    for (const provider_id of [...chunk.providers.keys()].toSorted()) {
      const provider = chunk.providers.get(provider_id)
      if (provider !== undefined) {
        providers.set(provider_id, provider)
      }
    }
  }

  return {
    run_at,
    bundle_format: 'catalog-v1',
    data,
    providers,
  } satisfies Catalog & { run_at: string; bundle_format: 'catalog-v1' }
}

async function scanModel(model: ModelRow) {
  const { endpoint: top } = model

  if (top === null) {
    return {
      item: {
        model_id: model.slug,
        variant: 'standard',
        model: storedModel(model, null),
        endpoints: null,
      },
      providers: new Map<string, CatalogProvider>(),
    }
  }

  const fetched = await fetchEndpoints({
    permaslug: model.permaslug,
    variant: top.variant,
  })

  // empty list is an empty Map; null is reserved for "no top endpoint"
  const endpoints = new Map<string, CatalogEndpoint>()
  const providers = new Map<string, CatalogProvider>()

  for (const row of fetched.toSorted((left, right) =>
    left.endpoint.endpoint_id.localeCompare(right.endpoint.endpoint_id),
  )) {
    endpoints.set(row.endpoint.endpoint_id, row.endpoint)
    providers.set(row.provider.provider_id, row.provider)
  }

  return {
    item: {
      model_id: top.model_variant_slug,
      variant: top.variant,
      model: storedModel(model, top.id),
      endpoints,
    },
    providers,
  }
}

function storedModel(model: ModelRow, endpointId: string | null): CatalogModel {
  const { endpoint: _endpoint, ...rest } = model
  return { ...rest, endpoint: endpointId }
}

export type CatalogV1 = Awaited<ReturnType<typeof scanCatalog>>
