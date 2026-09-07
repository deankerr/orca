import { gzipSync } from 'fflate'

import { httpAction } from '../../_generated/server'
import { getErrorMessage, isNonEmptyString } from '../../shared/utils'
import { getArchiveBundle } from '../shared/bundle'
import { formatBundle } from './format'

/**
 * GET /bundle
 *
 * Analysis download of a crawl archive. Replaces `/archive-sync/bundle.gz`.
 *
 * Query params:
 * - `crawl_id` (required)
 * - `format` (default `true`)
 * - `pretty` (default `false`)
 * - `gzip` (default `false`)
 */
export const serveBundles = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const crawlId = url.searchParams.get('crawl_id')

  if (!isNonEmptyString(crawlId)) {
    return new Response('Missing crawl_id parameter', { status: 400 })
  }

  const format = parseBooleanParam(url.searchParams.get('format'), true)
  const pretty = parseBooleanParam(url.searchParams.get('pretty'), false)
  const gzip = parseBooleanParam(url.searchParams.get('gzip'), false)

  if (format === 'invalid') {
    return new Response('Invalid format parameter', { status: 400 })
  }

  if (pretty === 'invalid') {
    return new Response('Invalid pretty parameter', { status: 400 })
  }

  if (gzip === 'invalid') {
    return new Response('Invalid gzip parameter', { status: 400 })
  }

  const bundle = await getArchiveBundle(ctx, crawlId)

  if (!bundle) {
    return new Response('Bundle not found', { status: 404 })
  }

  let payload: unknown = bundle
  let filename = `${bundle.crawl_id}.orca.json`

  if (format) {
    try {
      const formattedBundle = formatBundle(bundle)
      payload = formattedBundle
      filename = `${formattedBundle.crawl_at}.me1.orca.json`
    } catch (error) {
      return new Response(getErrorMessage(error), { status: 422 })
    }
  }

  const json = JSON.stringify(payload, null, pretty ? 2 : undefined)

  if (!gzip) {
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  }

  const compressed = gzipSync(new TextEncoder().encode(json))

  return new Response(compressed, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `inline; filename="${filename}.gz"`,
    },
  })
})

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean | 'invalid' {
  if (value === null) {
    return defaultValue
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return 'invalid'
}
