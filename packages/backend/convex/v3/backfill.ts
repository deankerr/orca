import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../_generated/api'
import { env, internalAction, internalQuery } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { findScanArtifact, loadScanArtifact, storeScanArtifact } from '../scan/artifact'
import type { ScanArtifact } from '../scan/artifact'
import { getArchiveBundleOrThrow } from '../snapshots/shared/bundle'
import { INITIAL_SCAN_ARTIFACT_ID } from './ingestions.table'
import { createScanProjection, INITIAL_SCAN_PROJECTION } from './projections/create'
import { diffScanProjections } from './projections/diff'
import { scanArtifactFromBundle } from './scanArtifactFromBundle'

const HOUR_MS = 60 * 60 * 1000
const LegacyBackfillEndScanAt = z.iso.datetime()

export function legacyBackfillEndCrawlId(value: string | undefined) {
  const parsed = LegacyBackfillEndScanAt.safeParse(value)
  return parsed.success ? Date.parse(parsed.data).toString() : null
}

export function crawlHour(crawl_id: string) {
  const from = Math.floor(Number(crawl_id) / HOUR_MS) * HOUR_MS
  return { fromCrawlId: from.toString(), beforeCrawlId: (from + HOUR_MS).toString() }
}

export function nextCrawlHour(scan_at: string) {
  return crawlHour(Date.parse(scan_at).toString()).beforeCrawlId
}

export const archiveCrawlIdInRange = internalQuery({
  args: {
    fromCrawlId: v.string(),
    beforeCrawlId: v.string(),
    order: v.union(v.literal('asc'), v.literal('desc')),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const archive = await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) =>
        q.gte('crawl_id', args.fromCrawlId).lt('crawl_id', args.beforeCrawlId),
      )
      .order(args.order)
      .first()

    return archive?.crawl_id ?? null
  },
})

export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const endCrawlId = legacyBackfillEndCrawlId(env.LEGACY_BACKFILL_END_SCAN_AT)
    if (endCrawlId === null) {
      console.warn('legacy backfill disabled: invalid LEGACY_BACKFILL_END_SCAN_AT')
      return null
    }

    // ponytail: this shares the ingestion cursor with the normal action; run only one at a time.
    const fromArtifactId: string = await ctx.runQuery(internal.v3.ingest.currentArtifactId, {})
    let fromCrawlId = ''
    let previous = INITIAL_SCAN_PROJECTION

    if (fromArtifactId !== INITIAL_SCAN_ARTIFACT_ID) {
      const previousArtifact = await loadScanArtifact(ctx, fromArtifactId)
      fromCrawlId = nextCrawlHour(previousArtifact.scan_at)
      previous = createScanProjection(previousArtifact)
    }

    const converted = await nextLegacyScanArtifact(ctx, fromCrawlId, endCrawlId)
    if (converted === null) {
      console.log('legacy backfill complete')
      return null
    }

    // R2 may have committed before a previous projection mutation failed.
    const stored = await findScanArtifact(ctx, converted.id)
    const nextArtifact = stored ?? converted
    const next = createScanProjection(nextArtifact)
    const writes = diffScanProjections(previous, next)

    if (stored === null) {
      await storeScanArtifact(ctx, nextArtifact)
    }

    console.log(`backfill: ${fromArtifactId} to ${nextArtifact.id}`)
    await ctx.runMutation(internal.v3.projections.apply.run, {
      fromArtifactId,
      toArtifactId: nextArtifact.id,
      writes,
    })

    await ctx.scheduler.runAfter(0, internal.v3.backfill.run, {})
    return null
  },
})

async function nextLegacyScanArtifact(
  ctx: ActionCtx,
  initialFromCrawlId: string,
  endCrawlId: string,
): Promise<ScanArtifact | null> {
  let fromCrawlId = initialFromCrawlId

  while (true) {
    const firstCrawlId: string | null = await ctx.runQuery(
      internal.v3.backfill.archiveCrawlIdInRange,
      {
        fromCrawlId,
        beforeCrawlId: endCrawlId,
        order: 'asc',
      },
    )
    if (firstCrawlId === null) {
      return null
    }

    const hour = crawlHour(firstCrawlId)
    let { beforeCrawlId } = hour

    while (true) {
      const crawl_id: string | null = await ctx.runQuery(
        internal.v3.backfill.archiveCrawlIdInRange,
        {
          fromCrawlId: hour.fromCrawlId,
          beforeCrawlId,
          order: 'desc',
        },
      )
      if (crawl_id === null) {
        break
      }

      const artifact = scanArtifactFromBundle(await getArchiveBundleOrThrow(ctx, crawl_id))
      if (artifact !== null) {
        return artifact
      }

      beforeCrawlId = crawl_id
    }

    fromCrawlId = hour.beforeCrawlId
  }
}
