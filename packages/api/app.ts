import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'

import type { LoadCatalog } from './http'
import { endpointRoutes } from './routes/endpoints'
import { modelRoutes } from './routes/models'
import { providerRoutes } from './routes/providers'

export type { Catalog, LoadCatalog } from './http'

export function createApp({
  basePath,
  loadCatalog,
}: {
  basePath: string
  loadCatalog: LoadCatalog
}) {
  const app = new OpenAPIHono()
    .basePath(basePath)
    .route('/', endpointRoutes(loadCatalog))
    .route('/', modelRoutes(loadCatalog))
    .route('/', providerRoutes(loadCatalog))

  app.doc31('/openapi.json', {
    info: {
      description:
        'ORCA observes OpenRouter models, endpoints, and providers over time. ' +
        'V5 is in development; its contract can change without notice.',
      title: 'ORCA API (V5 development)',
      version: '0.0.0',
    },
    openapi: '3.1.0',
  })

  app.get('/docs', Scalar({ pageTitle: 'ORCA API', url: `${basePath}/openapi.json` }))

  return app
}
