import { v } from 'convex/values'
import { z } from 'zod'

import { isNonEmptyString } from '@/shared/utils'

import { api, internal } from '../_generated/api'
import { httpAction, query } from '../_generated/server'

const archiveMetadataSchema = z.looseObject({
  size: z
    .looseObject({
      blob: z.number().optional(),
      raw: z.number().optional(),
    })
    .optional(),
  totals: z.record(z.string(), z.number()).optional(),
})

function getArchiveUtcDay(crawlId: string): string {
  return new Date(Number(crawlId)).toISOString().slice(0, 10)
}

function subtractUtcDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function hasFullArchiveCoverage(totals: Partial<Record<string, number>>): boolean {
  return (totals.analytics ?? 0) > 0 && (totals.topApps ?? 0) > 0 && (totals.uptimes ?? 0) > 0
}

function getArchiveMetadata(data: unknown): z.infer<typeof archiveMetadataSchema> {
  const parsed = archiveMetadataSchema.safeParse(data)
  return parsed.success ? parsed.data : {}
}

export const latestDaily = query({
  args: {
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Number.isInteger(args.days) ? args.days : Math.floor(args.days)
    if (limit <= 0) {
      throw new Error(
        `[admin/archiveSync:latestDaily] days must be greater than 0, received ${args.days}`,
      )
    }

    const fullArchiveByDay = new Map<
      string,
      {
        crawl_id: string
        day: string
        status: 'available'
        size: z.infer<typeof archiveMetadataSchema>['size'] | null
        totals: z.infer<typeof archiveMetadataSchema>['totals'] | null
      }
    >()
    let latestDay: string | null = null
    let oldestRequestedDay: string | null = null

    for await (const archive of ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id')
      .order('desc')) {
      const day = getArchiveUtcDay(archive.crawl_id)
      if (latestDay === null) {
        latestDay = day
        oldestRequestedDay = subtractUtcDays(day, limit - 1)
      }

      if (oldestRequestedDay !== null && day < oldestRequestedDay) {
        break
      }

      const metadata = getArchiveMetadata(archive.data)
      const totals = metadata.totals ?? {}
      if (!hasFullArchiveCoverage(totals) || fullArchiveByDay.has(day)) {
        continue
      }

      fullArchiveByDay.set(day, {
        crawl_id: archive.crawl_id,
        day,
        status: 'available',
        size: metadata.size ?? null,
        totals: metadata.totals ?? null,
      })
    }

    if (latestDay === null) {
      return []
    }

    return Array.from({ length: limit }, (_, index) => subtractUtcDays(latestDay, index)).map(
      (day) =>
        fullArchiveByDay.get(day) ?? {
          day,
          status: 'missing_full_bundle' as const,
        },
    )
  },
})

export const archiveSyncDaily = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const rawDays = url.searchParams.get('days')
  const days = rawDays === null ? 1 : Number.parseInt(rawDays, 10)

  if (!Number.isInteger(days) || days <= 0) {
    return new Response('Invalid days parameter', { status: 400 })
  }

  const archives = await ctx.runQuery(api.admin.archiveSync.latestDaily, { days })
  return Response.json(archives)
})

export const archiveSyncBundleGzip = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const crawlId = url.searchParams.get('crawl_id')

  if (!isNonEmptyString(crawlId)) {
    return new Response('Missing crawl_id parameter', { status: 400 })
  }

  const archive = await ctx.runQuery(internal.snapshots.shared.bundle.getByCrawlId, {
    crawl_id: crawlId,
  })

  if (!archive) {
    return new Response('Bundle not found', { status: 404 })
  }

  const blob = await ctx.storage.get(archive.storage_id)
  if (!blob) {
    return new Response('Bundle blob not found', { status: 404 })
  }

  return new Response(blob, {
    headers: {
      'Content-Disposition': `inline; filename="${crawlId}.bundle.json.gz"`,
      'Content-Type': 'application/gzip',
    },
  })
})
