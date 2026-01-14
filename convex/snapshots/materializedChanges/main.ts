import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, type ActionCtx } from '../../_generated/server'
import { paginateAndProcess } from '../../lib/paginateAndProcess'
import { materializeModelEndpoints } from '../materialize/main'
import { getArchiveBundle } from '../shared/bundle'
import { computeMaterializedChanges } from './process'

const MAX_PAIRS_PER_ACTION = 500
const BATCH_SIZE_INNER = 100

export const run = internalAction({
  args: {
    fromCrawlId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let previous: LoadedMaterializedSnapshot | null = null
    let processedPairs = 0
    let lastProcessedCrawlId: string | null = null

    const fromCrawlId =
      args.fromCrawlId ??
      (await ctx.runQuery(internal.snapshots.materializedChanges.inputs.getLatestCrawlId)) ??
      undefined

    await paginateAndProcess(ctx, {
      queryFnArgs: { fromCrawlId },
      queryFn: async (innerCtx, queryArgs) =>
        await innerCtx.runQuery(
          internal.snapshots.materializedChanges.inputs.listArchives,
          queryArgs,
        ),
      processFn: async (archives) => {
        for (const archive of archives) {
          const current = await loadMaterializedSnapshot(ctx, archive.crawl_id)

          if (!previous) {
            previous = current
            lastProcessedCrawlId = current.crawl_id
            continue
          }

          const changes = computeMaterializedChanges({
            previous: previous.materialized,
            current: current.materialized,
            previous_crawl_id: previous.crawl_id,
            crawl_id: current.crawl_id,
          })

          if (changes.length) {
            const counters = await ctx.runMutation(
              internal.snapshots.materializedChanges.output.upsert,
              {
                previous_crawl_id: previous.crawl_id,
                crawl_id: current.crawl_id,
                changes,
              },
            )

            console.log('[materializedChanges] pair processed', {
              previous_crawl_id: previous.crawl_id,
              crawl_id: current.crawl_id,
              count: changes.length,
              counters,
            })
          } else {
            console.log('[materializedChanges] no changes', {
              previous_crawl_id: previous.crawl_id,
              crawl_id: current.crawl_id,
            })
          }

          previous = current
          lastProcessedCrawlId = current.crawl_id
          processedPairs += 1

          if (processedPairs >= MAX_PAIRS_PER_ACTION) {
            return false
          }
        }
      },
      batchSize: BATCH_SIZE_INNER,
    })

    if (processedPairs >= MAX_PAIRS_PER_ACTION && lastProcessedCrawlId) {
      console.log('[materializedChanges] reached limit, rescheduling', {
        processedPairs,
        nextFromCrawlId: lastProcessedCrawlId,
      })

      await ctx.scheduler.runAfter(0, internal.snapshots.materializedChanges.main.run, {
        fromCrawlId: lastProcessedCrawlId,
      })
    } else {
      console.log('[materializedChanges] complete', { processedPairs })

      // * send alerts for the latest processed crawl
      if (lastProcessedCrawlId) {
        await ctx.scheduler.runAfter(0, internal.alerts.dispatcher.run, {
          crawl_id: lastProcessedCrawlId,
        })
      }
    }
  },
})

type LoadedMaterializedSnapshot = {
  crawl_id: string
  materialized: ReturnType<typeof materializeModelEndpoints>
}

async function loadMaterializedSnapshot(
  ctx: ActionCtx,
  crawl_id: string,
): Promise<LoadedMaterializedSnapshot> {
  const bundle = await getArchiveBundle(ctx, crawl_id)
  if (!bundle) {
    throw new Error(`[materializedChanges] missing bundle for crawl_id: ${crawl_id}`)
  }

  const materialized = materializeModelEndpoints(bundle)
  if (materialized.issues.length) {
    throw new Error(`[materializedChanges] validation issues for crawl ${crawl_id}`)
  }

  return {
    crawl_id,
    materialized,
  }
}
