import { createRoute } from '@hono/zod-openapi'
import { Endpoint } from '@orca/contract/endpoint'
import { Provider } from '@orca/contract/provider'
import { z } from 'zod'

import { EndpointSelection, selectEndpoints } from '../endpoints'
import {
  cached,
  createRouter,
  notFound,
  oneOf,
  pageOf,
  paginate,
  Paging,
  problem,
  problemHeaders,
} from '../http'
import type { LoadCatalog } from '../http'
import { ProviderSelection, selectProviders } from '../providers'
import { orderRequiresSort } from '../select'

const ProviderPath = z.object({
  id: z.string().meta({ description: 'Provider slug.', example: 'deepinfra' }),
})

const listProviders = createRoute({
  description: 'Search and sort known providers, including those without listed endpoints.',
  method: 'get',
  operationId: 'listProviders',
  path: '/providers',
  request: { query: orderRequiresSort(ProviderSelection.extend(Paging.shape)) },
  responses: {
    200: {
      content: { 'application/json': { schema: pageOf(Provider) } },
      description: 'Matching providers.',
    },
    400: problem('Invalid parameters'),
  },
  summary: 'List providers',
  tags: ['Providers'],
})

const getProvider = createRoute({
  method: 'get',
  operationId: 'getProvider',
  path: '/providers/{id}',
  request: { params: ProviderPath },
  responses: {
    200: {
      content: { 'application/json': { schema: oneOf(Provider) } },
      description: 'The provider.',
    },
    404: problem('Provider not found'),
  },
  summary: 'Get a provider',
  tags: ['Providers'],
})

const listProviderEndpoints = createRoute({
  description: 'Endpoints from one provider, with endpoint selection parameters.',
  method: 'get',
  operationId: 'listProviderEndpoints',
  path: '/providers/{id}/endpoints',
  request: {
    params: ProviderPath,
    query: orderRequiresSort(EndpointSelection.extend(Paging.shape)),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: pageOf(Endpoint) } },
      description: 'Matching endpoints.',
    },
    400: problem('Invalid parameters'),
    404: problem('Provider not found'),
  },
  summary: "List a provider's endpoints",
  tags: ['Providers'],
})

const providerNotFound = (id: string) =>
  notFound('Provider not found', `ORCA does not know provider ${id}.`)

export function providerRoutes(load: LoadCatalog) {
  const router = createRouter()

  router.openapi(listProviders, async (c) => {
    const { limit, offset, ...selection } = c.req.valid('query')
    const catalog = await load()
    const selected = selectProviders(catalog.providers, selection)
    return c.json(paginate(c.req.url, catalog.as_at, selected, { limit, offset }), 200, cached)
  })

  router.openapi(getProvider, async (c) => {
    const { id } = c.req.valid('param')
    const catalog = await load()
    const provider = catalog.providers.find((candidate) => candidate.id === id)
    if (provider === undefined) {
      return c.json(providerNotFound(id), 404, problemHeaders)
    }
    return c.json({ as_at: catalog.as_at, data: provider }, 200, cached)
  })

  router.openapi(listProviderEndpoints, async (c) => {
    const { id } = c.req.valid('param')
    const { limit, offset, ...selection } = c.req.valid('query')
    const catalog = await load()
    if (!catalog.providers.some((provider) => provider.id === id)) {
      return c.json(providerNotFound(id), 404, problemHeaders)
    }
    const selected = selectEndpoints(catalog.endpoints, selection, { providerId: id })
    return c.json(paginate(c.req.url, catalog.as_at, selected, { limit, offset }), 200, cached)
  })

  return router
}
