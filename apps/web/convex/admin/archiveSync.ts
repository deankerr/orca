import { isNonEmptyString } from '@/shared/utils'

import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'

function getArchiveUtcDay(crawlId: string): string {
  return new Date(Number(crawlId)).toISOString().slice(0, 10)
}

function isValidUtcDay(day: string): boolean {
  const date = new Date(`${day}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === day
}

export const archiveSyncBundleGzip = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const day = url.searchParams.get('day')
  const crawlId = url.searchParams.get('crawl_id')

  if (day !== null && crawlId !== null) {
    return new Response('Pass either day or crawl_id, not both', { status: 400 })
  }

  if (day !== null && !isValidUtcDay(day)) {
    return new Response('Invalid day parameter', { status: 400 })
  }

  if (crawlId !== null && !isNonEmptyString(crawlId)) {
    return new Response('Invalid crawl_id parameter', { status: 400 })
  }

  const archive = isNonEmptyString(crawlId)
    ? await ctx.runQuery(internal.snapshots.shared.bundle.getByCrawlId, {
        crawl_id: crawlId,
      })
    : await ctx.runQuery(internal.snapshots.shared.bundle.getLatestFull, {
        day: day ?? undefined,
      })

  if (!archive) {
    return new Response('Bundle not found', { status: 404 })
  }

  const blob = await ctx.storage.get(archive.storage_id)
  if (!blob) {
    return new Response('Bundle blob not found', { status: 404 })
  }

  const archiveDay = getArchiveUtcDay(archive.crawl_id)

  return new Response(blob, {
    headers: {
      'Content-Disposition': `inline; filename="${archiveDay}__${archive.crawl_id}.bundle.json.gz"`,
      'Content-Type': 'application/gzip',
    },
  })
})
