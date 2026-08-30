import { asyncMap } from 'convex-helpers'
import { up } from 'up-fetch'
import { z } from 'zod'

import { Endpoint } from './transforms/endpoint'
import { Model } from './transforms/model'
import type { Catalog, CatalogEndpoint, CatalogFile, CatalogModel, CatalogProvider } from './v1'
import { deserializeCatalog, serializeCatalog } from './v1'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

export type CatalogScan = Catalog & {
  run_at: string
  bundle_format: 'catalog-v1'
  file: CatalogFile
}

export async function scanCatalog(): Promise<CatalogScan> {
  const listed = await fetchListedModels()

  const models = new Map<string, CatalogModel>()
  for (const { model } of listed) {
    models.set(model.model_id, model)
  }

  const endpoints = new Map<string, CatalogEndpoint>()
  const providers = new Map<string, CatalogProvider>()
  const pages = await asyncMap(
    listed.filter((row) => row.has_endpoints),
    async ({ model }) => {
      const page = await fetchEndpointPage(model)
      return page.map((raw) => Endpoint.parse(raw))
    },
  )
  for (const page of pages) {
    for (const { endpoint, provider } of page) {
      endpoints.set(endpoint.endpoint_id, endpoint)
      providers.set(provider.provider_id, provider)
    }
  }

  const file = serializeCatalog({ models, endpoints, providers })
  return {
    run_at: new Date().toISOString(),
    bundle_format: 'catalog-v1',
    file,
    ...deserializeCatalog(file),
  }
}

async function fetchListedModels() {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: z.object({ data: z.array(Model) }),
  })
  return data.filter(({ model }) => isPublicTextModel(model))
}

async function fetchEndpointPage(model: { permaslug: string; variant: string }) {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params: { permaslug: model.permaslug, variant: model.variant },
    schema: z.object({ data: z.array(z.unknown()) }),
  })
  return data
}

function isPublicTextModel(model: CatalogModel) {
  // `~` slugs are latest aliases; their endpoint pages 404
  return (
    !model.slug.startsWith('~') &&
    model.input_modalities.includes('text') &&
    model.output_modalities.includes('text')
  )
}
