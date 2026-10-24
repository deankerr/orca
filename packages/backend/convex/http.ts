import { httpRouter } from 'convex/server'

import { serve as serveFeed } from './products/feed/http'
import { serveCached as servePublicApiV2Cached } from './public_api/v2/http'

const http = httpRouter()

http.route({ handler: serveFeed, method: 'GET', path: '/events/feed' })

// Serves the gzipped snapshot from v2/cache.refresh. See public_api/v2/http.ts.
http.route({
  handler: servePublicApiV2Cached,
  method: 'GET',
  path: '/public-api-preview/v2-cached',
})

export default http
