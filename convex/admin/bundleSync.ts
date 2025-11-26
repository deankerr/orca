import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference, WithoutSystemFields } from 'convex/server'

import { up } from 'up-fetch'

import { internal } from '../_generated/api'
import { Doc } from '../_generated/dataModel'
import { httpAction, internalAction } from '../_generated/server'
import { getEnv } from '../lib/utils'

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
      internal.db.snapshot.crawl.archives.getLatestCrawlId,
    )
    console.log('[bundleSync]', { latestCrawlId: latestCrawlId ?? null })

    // Fetch all archives from source
    const archives = await convexClient.query(
      makeFunctionReference<'query', any, ServerArchive[]>('db/snapshot/crawl/archives:collect'),
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
      await ctx.runMutation(internal.db.snapshot.crawl.archives.insert, {
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

    const archive = await ctx.runQuery(internal.db.snapshot.crawl.archives.getByCrawlId, {
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
