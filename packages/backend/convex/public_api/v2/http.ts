import { gunzipSync } from 'fflate'

import { internal } from '../../_generated/api'
import { httpAction } from '../../_generated/server'

/**
 * GET /public-api-preview/v2
 *
 * Rebuilds the v2 payload from catalog views on every request. Used as the
 * always-fresh path and by the Next rewrite until traffic switches to
 * `/public-api-preview/v2-cached`.
 */
export const serve = httpAction(async (ctx) => {
  const result = await ctx.runQuery(internal.public_api.v2.queries.get)
  return Response.json(result)
})

/**
 * GET /public-api-preview/v2-cached
 *
 * Serves the prebuilt gzipped payload written by `v2/cache.refresh` after
 * snapshot materialize. This path never rebuilds the response.
 *
 * After the first refresh, a missing pointer or blob is a broken invariant.
 * Those cases are logged and returned as 500 — not 404 — so we do not leak
 * cache internals to clients.
 *
 * Encoding:
 * - `Accept-Encoding: gzip` (or `*`) → stored gzip bytes, `Content-Encoding: gzip`
 * - otherwise → gunzip at the origin and return JSON
 *
 * Caching:
 * - `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`
 * - `ETag` is the storage id (plus `-identity` when serving uncompressed)
 * - `Last-Modified` is the cache document `_creationTime`
 * - `If-None-Match` / `If-Modified-Since` → 304
 * - `Vary: Accept-Encoding`
 */
export const serveCached = httpAction(async (ctx, req) => {
  const snapshot = await ctx.runQuery(internal.public_api.v2.cache.get)

  if (snapshot === null) {
    console.error('[public_api:v2] missing cache pointer')
    return new Response('Internal server error', { status: 500 })
  }

  const blob = await ctx.storage.get(snapshot.storage_id)
  if (blob === null) {
    console.error('[public_api:v2] missing cache blob', { storage_id: snapshot.storage_id })
    return new Response('Internal server error', { status: 500 })
  }

  const serveGzip = acceptsGzip(req.headers.get('Accept-Encoding'))
  const etag = representationEtag(snapshot.storage_id, serveGzip ? 'gzip' : 'identity')

  if (shouldReturnNotModified(req, etag, snapshot._creationTime)) {
    return new Response(null, {
      status: 304,
      headers: representationHeaders({
        contentType: snapshot.content_type,
        etag,
        updatedAt: snapshot._creationTime,
      }),
    })
  }

  if (serveGzip) {
    return new Response(blob, {
      headers: representationHeaders({
        contentType: snapshot.content_type,
        etag,
        updatedAt: snapshot._creationTime,
        contentEncoding: 'gzip',
        contentLength: snapshot.size,
      }),
    })
  }

  const body = gunzipSync(new Uint8Array(await blob.arrayBuffer()))

  return new Response(body, {
    headers: representationHeaders({
      contentType: snapshot.content_type,
      etag,
      updatedAt: snapshot._creationTime,
      contentLength: body.byteLength,
    }),
  })
})

const cacheControl = 'public, s-maxage=300, stale-while-revalidate=3600'

function representationEtag(storageId: string, encoding: 'gzip' | 'identity'): string {
  return encoding === 'gzip' ? `"${storageId}"` : `"${storageId}-identity"`
}

function representationHeaders(args: {
  contentType: string
  etag: string
  updatedAt: number
  contentEncoding?: 'gzip'
  contentLength?: number
}): Headers {
  const headers = new Headers({
    'Content-Type': args.contentType,
    'Cache-Control': cacheControl,
    ETag: args.etag,
    'Last-Modified': new Date(args.updatedAt).toUTCString(),
    Vary: 'Accept-Encoding',
  })

  if (args.contentEncoding !== undefined) {
    headers.set('Content-Encoding', args.contentEncoding)
  }

  if (args.contentLength !== undefined) {
    headers.set('Content-Length', String(args.contentLength))
  }

  return headers
}

function shouldReturnNotModified(req: Request, etag: string, updatedAt: number): boolean {
  const ifNoneMatch = req.headers.get('If-None-Match')
  if (ifNoneMatch !== null) {
    return ifNoneMatchHits(ifNoneMatch, etag)
  }

  return ifModifiedSinceFresh(req.headers.get('If-Modified-Since'), updatedAt)
}

function ifNoneMatchHits(header: string, etag: string): boolean {
  if (header.trim() === '*') {
    return true
  }

  return header.split(',').some((part) => {
    const token = part.trim().replace(/^W\//, '')
    return token === etag
  })
}

function ifModifiedSinceFresh(header: string | null, updatedAt: number): boolean {
  if (header === null) {
    return false
  }

  const since = Date.parse(header)
  if (!Number.isFinite(since)) {
    return false
  }

  return Math.floor(updatedAt / 1000) <= Math.floor(since / 1000)
}

function acceptsGzip(acceptEncoding: string | null): boolean {
  if (acceptEncoding === null || acceptEncoding.trim() === '') {
    return false
  }

  let starQ = 0
  let gzipQ: number | undefined

  for (const part of acceptEncoding.split(',')) {
    const segments = part.trim().split(';')
    const name = segments[0]?.trim().toLowerCase()
    if (name === undefined || name === '') {
      continue
    }

    let q = 1
    for (const param of segments.slice(1)) {
      const trimmed = param.trim()
      if (trimmed.startsWith('q=')) {
        const parsed = Number(trimmed.slice(2))
        if (Number.isFinite(parsed)) {
          q = parsed
        }
      }
    }

    if (name === 'gzip') {
      gzipQ = q
    } else if (name === '*') {
      starQ = q
    }
  }

  return (gzipQ ?? starQ) > 0
}
