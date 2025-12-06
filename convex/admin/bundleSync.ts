import { nullable } from 'convex-helpers/validators'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference, WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'

import { up } from 'up-fetch'

import { internal } from '../_generated/api'
import { Doc } from '../_generated/dataModel'
import { httpAction, internalAction, internalQuery, query } from '../_generated/server'
import { db } from '../db'
import { getEnv } from '../lib/env'

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

export const collect = query({
  handler: async (ctx) => {
    return await ctx.db.query('snapshot_crawl_archives').collect()
  },
})

// * Client
type ServerArchive = WithoutSystemFields<Doc<'snapshot_crawl_archives'>> & {
  _id: string
  _creationTime: number
}

const BATCH_SIZE = 200

/**
 * Sync archives from source deployment to current instance.
 * Resumable - automatically continues from latest synced crawl_id.
 * Processes in batches to avoid function timeout.
 */
export const syncFromSource = internalAction({
  args: {},
  handler: async (ctx) => {
    const sourceDeployment = getEnv('ARCHIVE_SYNC_SOURCE_DEPLOYMENT')

    // Setup HTTP client for bundle downloads (.site URL)
    const upFetch = up(fetch, () => ({
      baseUrl: `https://${sourceDeployment}.convex.site`,
      retry: {
        attempts: 2,
        delay: (ctx) => ctx.attempt ** 2 * 1000,
      },
    }))

    // Setup Convex client for queries (.cloud URL)
    const convexClient = new ConvexHttpClient(`https://${sourceDeployment}.convex.cloud`)

    // Check what we've already synced
    const latestCrawlId: string | null = await ctx.runQuery(
      internal.admin.bundleSync.getLatestCrawlId,
    )
    console.log('[bundleSync]', { latestCrawlId: latestCrawlId ?? null })

    // Fetch all archives from source
    const archives = await convexClient.query(
      makeFunctionReference<'query', any, ServerArchive[]>('admin/bundleSync:collect'),
    )
    console.log('[bundleSync]', { totalArchivesFromSource: archives.length })

    // Sort oldest to newest
    const sortedArchives = archives.sort((a, b) => parseInt(a.crawl_id) - parseInt(b.crawl_id))

    // Filter out archives we've already synced
    const remainingArchives: ServerArchive[] = latestCrawlId
      ? sortedArchives.filter((archive) => parseInt(archive.crawl_id) > parseInt(latestCrawlId))
      : sortedArchives

    console.log('[bundleSync]', { archivesToSync: remainingArchives.length })

    // Process in batches to avoid timeout
    const batchToProcess = remainingArchives.slice(0, BATCH_SIZE)
    const hasMore = remainingArchives.length > BATCH_SIZE

    let syncedCount = 0
    for (const archive of batchToProcess) {
      // Download the bundle
      const bundleBuffer = await upFetch(`/sync/bundle`, {
        params: {
          crawl_id: archive.crawl_id,
        },
        parseResponse: (res) => res.arrayBuffer(),
      })

      const blob = new Blob([bundleBuffer])
      const storage_id = await ctx.storage.store(blob)

      // Preserve origin metadata
      const { _id, _creationTime, data } = archive
      const modifiedData = {
        ...data,
        origin: {
          id: _id,
          creationTime: _creationTime,
        },
      }

      // Insert the archive record
      await ctx.runMutation(internal.snapshots.crawl.outputs.insert, {
        crawl_id: archive.crawl_id,
        storage_id,
        data: modifiedData,
      })

      syncedCount++
    }

    if (hasMore) {
      const remainingAfterBatch = remainingArchives.length - syncedCount
      console.log('[bundleSync]', {
        synced: syncedCount,
        remaining: remainingAfterBatch,
        rescheduling: true,
      })
      // Schedule next batch immediately
      await ctx.scheduler.runAfter(0, internal.admin.bundleSync.syncFromSource, {})
    }

    console.log('[bundleSync]', { synced: syncedCount, complete: true })
    await ctx.scheduler.runAfter(0, internal.snapshots.materialize.main.run, {})
  },
})

// * Server
// HTTP endpoint for bundle downloads

export const bundleSyncHttpHandler = httpAction(async (ctx, req) => {
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()

  if (action === 'bundle') {
    // Download specific archive bundle
    const crawlId = url.searchParams.get('crawl_id')

    if (!crawlId) {
      return new Response('Missing crawl_id parameter', { status: 400 })
    }

    const archive = await ctx.runQuery(internal.admin.bundleSync.getByCrawlId, {
      crawl_id: crawlId,
    })

    if (!archive) {
      return new Response('Archive not found', { status: 404 })
    }

    const blob = await ctx.storage.get(archive.storage_id)
    if (!blob) {
      return new Response('Bundle not found', { status: 404 })
    }

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })
  }

  return new Response('Not found', { status: 404 })
})
