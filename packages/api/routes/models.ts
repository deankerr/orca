import { createRoute } from '@hono/zod-openapi'
import { Endpoint } from '@orca/contract/endpoint'
import { Model } from '@orca/contract/model'

import { EndpointSelection, selectEndpoints } from '../endpoints'
import {
  cached,
  createRouter,
  ModelPath,
  notFound,
  oneOf,
  pageOf,
  paginate,
  Paging,
  problem,
  problemHeaders,
} from '../http'
import type { LoadCatalog } from '../http'
import { ModelSelection, selectModels } from '../models'
import { orderRequiresSort } from '../select'

const listModels = createRoute({
  description: 'Search, filter, and sort known models, including those without listed endpoints.',
  method: 'get',
  operationId: 'listModels',
  path: '/models',
  request: { query: orderRequiresSort(ModelSelection.extend(Paging.shape)) },
  responses: {
    200: {
      content: { 'application/json': { schema: pageOf(Model) } },
      description: 'Matching models.',
    },
    400: problem('Invalid parameters'),
  },
  summary: 'List models',
  tags: ['Models'],
})

const getModel = createRoute({
  description: 'The path holds the model slug verbatim, including any `:variant` suffix.',
  method: 'get',
  operationId: 'getModel',
  path: '/models/{author}/{slug}',
  request: { params: ModelPath },
  responses: {
    200: { content: { 'application/json': { schema: oneOf(Model) } }, description: 'The model.' },
    404: problem('Model not found'),
  },
  summary: 'Get a model',
  tags: ['Models'],
})

const listModelEndpoints = createRoute({
  description:
    'Endpoints serving one model, with endpoint selection parameters. ' +
    'The path holds the model slug verbatim, including any `:variant` suffix.',
  method: 'get',
  operationId: 'listModelEndpoints',
  path: '/models/{author}/{slug}/endpoints',
  request: { params: ModelPath, query: orderRequiresSort(EndpointSelection.extend(Paging.shape)) },
  responses: {
    200: {
      content: { 'application/json': { schema: pageOf(Endpoint) } },
      description: 'Matching endpoints.',
    },
    400: problem('Invalid parameters'),
    404: problem('Model not found'),
  },
  summary: "List a model's endpoints",
  tags: ['Models'],
})

const modelNotFound = (modelId: string) =>
  notFound('Model not found', `ORCA does not know model ${modelId}.`)

export function modelRoutes(load: LoadCatalog) {
  const router = createRouter()

  router.openapi(listModels, async (c) => {
    const { limit, offset, ...selection } = c.req.valid('query')
    const catalog = await load()
    const selected = selectModels(catalog.models, selection)

    return c.json(paginate(c.req.url, catalog.as_at, selected, { limit, offset }), 200, cached)
  })

  router.openapi(getModel, async (c) => {
    const { author, slug } = c.req.valid('param')
    const modelId = `${author}/${slug}`
    const catalog = await load()
    const model = catalog.models.find((candidate) => candidate.id === modelId)

    if (model === undefined) {
      return c.json(modelNotFound(modelId), 404, problemHeaders)
    }

    return c.json({ as_at: catalog.as_at, data: model }, 200, cached)
  })

  router.openapi(listModelEndpoints, async (c) => {
    const { author, slug } = c.req.valid('param')
    const { limit, offset, ...selection } = c.req.valid('query')
    const modelId = `${author}/${slug}`
    const catalog = await load()

    if (!catalog.models.some((model) => model.id === modelId)) {
      return c.json(modelNotFound(modelId), 404, problemHeaders)
    }

    const selected = selectEndpoints(catalog.endpoints, selection, { modelId })

    return c.json(paginate(c.req.url, catalog.as_at, selected, { limit, offset }), 200, cached)
  })

  return router
}
