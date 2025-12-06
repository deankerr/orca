import { pruneNull } from 'convex-helpers'
import * as R from 'remeda'
import z from 'zod'

import { internal } from '../../_generated/api'
import { Doc } from '../../_generated/dataModel'
import { ActionCtx, internalAction } from '../../_generated/server'
import { paginateAndProcess } from '../../lib/paginateAndProcess'
import { CrawlArchiveBundle } from '../crawl/main'
import { ModelTransformSchema } from '../materialize/validators/models'
import { getArchiveBundleOrThrow } from '../shared/bundle'

const AnalyticsStatsRecord = z.object({
  date: z.string(),
  model_permaslug: z.string(),
  variant: z.string(),
  variant_permaslug: z.string(),
  count: z.number(),
  total_completion_tokens: z.number(),
  total_prompt_tokens: z.number(),
  total_native_tokens_reasoning: z.number(),
  num_media_prompt: z.number(),
  num_media_completion: z.number(),
  total_native_tokens_cached: z.number(),
  total_tool_calls: z.number(),
})

const AnalyticsStats = z
  .record(z.string(), AnalyticsStatsRecord)
  .transform((val) => Object.values(val))

const Analytics = z.object({
  models: ModelTransformSchema.array(),
  analytics: AnalyticsStats,
})

function getDayTimestamp(crawlId: string) {
  const date = new Date(Number(crawlId))
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

async function processArchiveDay(ctx: ActionCtx, archiveDay: Doc<'snapshot_crawl_archives'>[]) {
  // * sort archives latest first
  const sortedArchives = archiveDay.sort((a, b) => b.crawl_id.localeCompare(a.crawl_id))

  for (const archive of sortedArchives) {
    // * skip bundles without analytics
    if (!archive.data.totals?.analytics) continue

    const bundle = await getArchiveBundleOrThrow(ctx, archive.crawl_id)
    const stats = processStats(bundle)

    if (stats) {
      // * upsert stats
      const upsertCounts = await ctx.runMutation(internal.snapshots.stats.outputs.upsert, { stats })
      const day_timestamp = getDayTimestamp(bundle.crawl_id)
      console.log('[snapshots:stats:processArchiveDay]', {
        crawl_id: bundle.crawl_id,
        day_timestamp,
        day: new Date(day_timestamp),
        count: stats.length,
        results: upsertCounts,
      })

      // * successfully processed day, return success
      return true
    }
  }

  return false
}

export function processStats(bundle: CrawlArchiveBundle) {
  const rawData = bundle.data.analytics
  if (!rawData) {
    console.warn('no analytics in this bundle')
    return
  }

  const parsed = Analytics.safeParse(rawData)
  if (!parsed.success) {
    console.error(z.prettifyError(parsed.error))
    return
  }

  const day_timestamp = getDayTimestamp(bundle.crawl_id)

  // find matching model record for slug/base_slug
  const stats = parsed.data.analytics.map((data) => {
    const model = parsed.data.models.find(
      (m) => m.version_slug === data.model_permaslug && m.variant === data.variant,
    )

    // these are stats for an old model that is no longer available
    if (!model) return null

    return {
      day_timestamp,
      slug: model.slug,
      base_slug: model.base_slug,
      version_slug: data.model_permaslug,
      variant: data.variant,
      total_input_tokens: data.total_prompt_tokens,
      total_output_tokens: data.total_completion_tokens,
      num_media_input: data.num_media_prompt,
      num_media_output: data.num_media_completion,
      or_date: data.date,
      crawl_id: bundle.crawl_id,
      ...R.pick(data, [
        'count',
        'total_native_tokens_cached',
        'total_native_tokens_reasoning',
        'total_tool_calls',
      ]),
    }
  })

  return pruneNull(stats)
}

export const backfill = internalAction({
  handler: async (ctx) => {
    const latestCrawlId = await ctx.runQuery(internal.snapshots.stats.inputs.getLatestCrawlId)

    let pending: Doc<'snapshot_crawl_archives'>[] = []
    await paginateAndProcess(ctx, {
      queryFnArgs: { fromCrawlId: latestCrawlId ?? undefined },
      queryFn: async (ctx, args) =>
        await ctx.runQuery(internal.snapshots.stats.inputs.listArchives, args),
      processFn: async (archives) => {
        // * group bundles by day, earliest to latest including any from previous iteration
        const sorted = [...pending, ...archives].sort((a, b) =>
          a.crawl_id.localeCompare(b.crawl_id),
        )
        const byDay = [...Map.groupBy(sorted, (a) => getDayTimestamp(a.crawl_id)).values()]
        // * store latest day for next iteration
        pending = byDay.pop() ?? []
        for (const archiveDay of byDay) {
          await processArchiveDay(ctx, archiveDay)
        }
      },
      batchSize: 100,
    })
    // * process any remaining pending archives after pagination completes
    if (pending.length > 0) {
      await processArchiveDay(ctx, pending)
    }
  },
})
