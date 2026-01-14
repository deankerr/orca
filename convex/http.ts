import { httpRouter } from 'convex/server'

import { httpAction } from './_generated/server'
import { bundleSyncHttpHandler } from './admin/bundleSync'
import { handleInteraction } from './discord/interactions'
import { previewV1HttpHandler } from './public_api/preview_v1'
import { previewV2HttpHandler } from './public_api/preview_v2'
import { getArchiveBundle } from './snapshots/shared/bundle'

const http = httpRouter()

// Discord bot interactions endpoint
http.route({
  path: '/discord/interactions',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const publicKey = process.env.DISCORD_PUBLIC_KEY
    if (!publicKey) {
      console.error('[discord:interactions] DISCORD_PUBLIC_KEY not configured')
      return new Response('Server configuration error', { status: 500 })
    }

    const signature = req.headers.get('X-Signature-Ed25519')
    const timestamp = req.headers.get('X-Signature-Timestamp')

    if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 })
    }

    const body = await req.text()

    return handleInteraction(ctx, {
      body,
      signature,
      timestamp,
      publicKey,
    })
  }),
})

http.route({
  path: '/bundle',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url)
    const crawlId = url.searchParams.get('crawl_id')

    if (!crawlId) {
      return new Response('Missing crawl_id parameter', { status: 400 })
    }

    const bundle = await getArchiveBundle(ctx, crawlId)

    if (!bundle) {
      return new Response('Bundle not found', { status: 404 })
    }

    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }),
})

http.route({
  path: '/public-api-preview/v2',
  method: 'GET',
  handler: httpAction(async (ctx) => {
    const result = await previewV2HttpHandler(ctx)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }),
})

http.route({
  path: '/public-api-preview/v1',
  method: 'GET',
  handler: httpAction(async (ctx) => {
    const result = await previewV1HttpHandler(ctx)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }),
})

http.route({
  method: 'GET',
  pathPrefix: '/sync/',
  handler: bundleSyncHttpHandler,
})

export default http
