import { httpRouter } from 'convex/server'

import { env, httpAction } from './_generated/server'
import { handleInteraction } from './discord/interactions'
import { serve as serveObject } from './objects/http'
import {
  serve as servePublicApiV2,
  serveCached as servePublicApiV2Cached,
} from './public_api/v2/http'
import { isNonEmptyString } from './shared/utils'
import { serveBundles } from './snapshots/bundles/http'

const http = httpRouter()

// Discord bot interactions endpoint
http.route({
  path: '/discord/interactions',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const publicKey = env.DISCORD_PUBLIC_KEY

    if (!isNonEmptyString(publicKey)) {
      console.error('[discord:interactions] DISCORD_PUBLIC_KEY not configured')
      return new Response('Server configuration error', { status: 500 })
    }

    const signature = req.headers.get('X-Signature-Ed25519')
    const timestamp = req.headers.get('X-Signature-Timestamp')

    if (!isNonEmptyString(signature) || !isNonEmptyString(timestamp)) {
      return new Response('Missing signature headers', { status: 401 })
    }

    const body = await req.text()

    return await handleInteraction(ctx, {
      body,
      signature,
      timestamp,
      publicKey,
    })
  }),
})

// Analysis download of a crawl archive. See snapshots/bundles/http.ts.
http.route({
  path: '/bundle',
  method: 'GET',
  handler: serveBundles,
})

http.route({
  path: '/objects',
  method: 'GET',
  handler: serveObject,
})

// Rebuilds the v2 payload from catalog views on every request. See public_api/v2/http.ts.
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
