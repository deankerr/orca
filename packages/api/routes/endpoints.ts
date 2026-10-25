import { createRoute } from '@hono/zod-openapi'
import { Endpoint } from '@orca/contract/endpoint'
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
import { orderRequiresSort } from '../select'

const listEndpoints = createRoute({
  description: 'Search, filter, and sort endpoint listings.',
  method: 'get',
  operationId: 'listEndpoints',
  path: '/endpoints',
  request: { query: orderRequiresSort(EndpointSelection.extend(Paging.shape)) },
  responses: {
    200: {
      content: { 'application/json': { schema: pageOf(Endpoint) } },
      description: 'Matching endpoints.',
    },
    400: problem('Invalid parameters'),
  },
  summary: 'List endpoints',
  tags: ['Endpoints'],
})

const getEndpoint = createRoute({
  method: 'get',
  operationId: 'getEndpoint',
  path: '/endpoints/{id}',
  request: { params: z.object({ id: z.string().meta({ description: 'Endpoint UUID.' }) }) },
  responses: {
    200: {
      content: { 'application/json': { schema: oneOf(Endpoint) } },
      description: 'The endpoint.',
    },
    404: problem('Endpoint not found'),
  },
  summary: 'Get an endpoint',
  tags: ['Endpoints'],
})

export function endpointRoutes(load: LoadCatalog) {
  const router = createRouter()

  router.openapi(listEndpoints, async (c) => {
    const { limit, offset, ...selection } = c.req.valid('query')
    const catalog = await load()
    const selected = selectEndpoints(catalog.endpoints, selection)
    return c.json(paginate(c.req.url, catalog.as_at, selected, { limit, offset }), 200, cached)
  })

  router.openapi(getEndpoint, async (c) => {
    const { id } = c.req.valid('param')
    const catalog = await load()
    const endpoint = catalog.endpoints.find((candidate) => candidate.id === id)
    if (endpoint === undefined) {
      const problemBody = notFound('Endpoint not found', `No current endpoint has ID ${id}.`)
      return c.json(problemBody, 404, problemHeaders)
    }
    return c.json({ as_at: catalog.as_at, data: endpoint }, 200, cached)
  })

  return router
}
