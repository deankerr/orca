import { nullable } from 'convex-helpers/validators'
import { v } from 'convex/values'
import { gunzipSync } from 'fflate'

import { internal } from '../../_generated/api'
import { type ActionCtx, internalQuery } from '../../_generated/server'
import { db } from '../../db'
import type { CrawlArchiveBundle } from '../crawl/main'

const textDecoder = new TextDecoder()

export const getLatestCrawlId = internalQuery({
  returns: nullable(v.string()),
  handler: async (ctx) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id')
      .order('desc')
      .first()
      .then((r) => r?.crawl_id ?? null)
  },
})

export const getByCrawlId = internalQuery({
  args: {
    crawl_id: v.string(),
  },
  returns: nullable(db.snapshot.crawl.archives.vTable.doc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
      .first()
  },
})

export async function getArchiveBundleOrThrow(
  ctx: ActionCtx,
  crawl_id?: string,
): Promise<CrawlArchiveBundle> {
  const resolved_crawl_id =
    crawl_id ?? (await ctx.runQuery(internal.snapshots.shared.bundle.getLatestCrawlId))

  if (!resolved_crawl_id) {
    throw new Error('[bundle] no crawl_id found')
  }

  const bundle = await getArchiveBundle(ctx, resolved_crawl_id)
  if (!bundle) {
    throw new Error(`[bundle] no bundle found for crawl_id: ${resolved_crawl_id}`)
  }

  return bundle
}

export async function getArchiveBundle(
  ctx: ActionCtx,
  crawlId: string,
): Promise<CrawlArchiveBundle | null> {
  const archive = await ctx.runQuery(internal.snapshots.shared.bundle.getByCrawlId, {
    crawl_id: crawlId,
  })
  if (!archive) return null
  const blob = await ctx.storage.get(archive.storage_id)
  if (!blob) return null
  const decompressed = gunzipSync(new Uint8Array(await blob.arrayBuffer()))
  return JSON.parse(textDecoder.decode(decompressed)) as CrawlArchiveBundle
}
