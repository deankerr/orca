import { httpRouter } from 'convex/server'

import { httpAction } from './_generated/server'
import { handleInteraction } from './discord/interactions'
import { getR2Artifact } from './lib/r2'
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
    const publicKey = process.env.DISCORD_PUBLIC_KEY
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
  path: '/r2/artifact',
  method: 'GET',
  handler: httpAction(async (_ctx, req) => {
    const url = new URL(req.url)
    const artifact_id = url.searchParams.get('artifact_id')

    if (!isNonEmptyString(artifact_id)) {
      return new Response('Missing artifact_id parameter', { status: 400 })
    }

    const record = await getR2Artifact(artifact_id)

    if (record === null) {
      return new Response('Artifact not found', { status: 404 })
    }

    return Response.json(record)
  }),
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
