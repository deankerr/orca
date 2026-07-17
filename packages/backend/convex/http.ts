import { httpRouter } from 'convex/server'

import { isNonEmptyString } from '../shared/utils'
import { api } from './_generated/api'
import { httpAction } from './_generated/server'
import { archiveSyncBundleGzip } from './admin/archiveSync'
import { handleInteraction } from './discord/interactions'
import { getR2Artifact } from './lib/r2'
import { getArchiveBundle } from './snapshots/shared/bundle'

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

http.route({
  path: '/bundle',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url)
    const crawlId = url.searchParams.get('crawl_id')

    if (!isNonEmptyString(crawlId)) {
      return new Response('Missing crawl_id parameter', { status: 400 })
    }

    const bundle = await getArchiveBundle(ctx, crawlId)

    if (!bundle) {
      return new Response('Bundle not found', { status: 404 })
    }

    return Response.json(bundle)
  }),
})

http.route({
  path: '/archive-sync/bundle.gz',
  method: 'GET',
  handler: archiveSyncBundleGzip,
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

http.route({
  path: '/public-api-preview/v2',
  method: 'GET',
  handler: httpAction(async (ctx) => {
    const result = await ctx.runQuery(api.public_api.preview_v2.getModels, {})
    return Response.json(result)
  }),
})

export default http
