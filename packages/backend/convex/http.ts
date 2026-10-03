import { httpRouter } from 'convex/server'

import { serve as serveFeed } from './alerts/feed/http'
import {
  serve as servePublicApiV2,
  serveCached as servePublicApiV2Cached,
} from './public_api/v2/http'

const http = httpRouter()

http.route({ path: '/events/feed', method: 'GET', handler: serveFeed })

// Rebuilds the v2 payload from scans on every request. See public_api/v2/http.ts.
http.route({
  path: '/public-api-preview/v2',
  method: 'GET',
  handler: servePublicApiV2,
})

// Serves the gzipped snapshot from v2/cache.refresh. See public_api/v2/http.ts.
http.route({
  path: '/public-api-preview/v2-cached',
  method: 'GET',
  handler: servePublicApiV2Cached,
})

export default http
