import { getPage } from 'convex-helpers/server/pagination';
import type { IndexKey } from 'convex-helpers/server/pagination';

import { internalMutation } from '../_generated/server'
import schema from '../schema'

const getDayFromTimestamp = (timestamp: number) => {
  const [day] = new Date(timestamp).toISOString().split('T')
  return day
}

const getMedian = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log('[changes:run] Starting analysis...')
    const toPercent = (count: number) => `${((count / stats.total) * 100).toFixed(1)}%`

    const stats = {
      total: 0,
      byEntity: {} as Record<string, number>,
      byChangeKind: {} as Record<string, number>,
      byEntityAndChangeKind: {} as Record<string, number>,
      byPath: {} as Record<string, number>,
      byModelSlug: {} as Record<string, number>,
      byProviderSlug: {} as Record<string, number>,
      byProviderTagSlug: {} as Record<string, number>,
      byCrawl: {} as Record<string, number>,
      byDay: {} as Record<string, number>,
    }

    // * Use getPage to paginate through all changes (supports multiple pages per function)
    let startIndexKey: IndexKey | undefined
    let hasMore = true
    const batchSize = 500

    while (hasMore) {
      const {
        page,
        indexKeys,
        hasMore: nextHasMore,
      } = await getPage(ctx, {
        table: 'or_views_changes',
        index: 'by_crawl_id',
        schema,
        startIndexKey,
        targetMaxRows: batchSize,
        order: 'desc',
      })
      hasMore = nextHasMore

      for (const change of page) {
        stats.total += 1

        // Entity type distribution
        stats.byEntity[change.entity_type] = (stats.byEntity[change.entity_type] || 0) + 1

        // Change kind distribution
        stats.byChangeKind[change.change_kind] = (stats.byChangeKind[change.change_kind] || 0) + 1

        // Entity + Change kind distribution (e.g., "endpoint update")
        const entityChangeKey = `${change.entity_type} ${change.change_kind}`
        stats.byEntityAndChangeKind[entityChangeKey] =
          (stats.byEntityAndChangeKind[entityChangeKey] || 0) + 1

        // Path distribution (category-level changes)
        if (change.path_level_1 !== undefined && change.path_level_1 !== '') {
          stats.byPath[change.path_level_1] = (stats.byPath[change.path_level_1] || 0) + 1
        }

        if ('model_slug' in change) {
          stats.byModelSlug[change.model_slug] = (stats.byModelSlug[change.model_slug] || 0) + 1
        }

        if ('provider_slug' in change) {
          stats.byProviderSlug[change.provider_slug] =
            (stats.byProviderSlug[change.provider_slug] || 0) + 1
        }

        if ('provider_tag_slug' in change) {
          stats.byProviderTagSlug[change.provider_tag_slug] =
            (stats.byProviderTagSlug[change.provider_tag_slug] || 0) + 1
        }

        // Changes per crawl_id
        stats.byCrawl[change.crawl_id] = (stats.byCrawl[change.crawl_id] || 0) + 1

        // Changes per day (extract date from crawl_id timestamp)
        const timestamp = Number(change.crawl_id)
        if (!Number.isNaN(timestamp)) {
          const day = getDayFromTimestamp(timestamp)
          if (day) {
            stats.byDay[day] = (stats.byDay[day] || 0) + 1
          }
        }
      }

      if (hasMore && indexKeys.length > 0) {
        startIndexKey = indexKeys.at(-1)
      }
    }

    // * Calculate derived statistics
    const crawlIds = Object.keys(stats.byCrawl)
    const days = Object.keys(stats.byDay).toSorted()

    const topPaths = Object.entries(stats.byPath)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([path, count]) => [path, count, toPercent(count)])

    const entityChangeDistribution = Object.entries(stats.byEntityAndChangeKind)
      .toSorted((a, b) => b[1] - a[1])
      .map(([entityChangeKey, count]) => [entityChangeKey, count, toPercent(count)])

    const modelSlugFrequency = Object.entries(stats.byModelSlug)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([slug, count]) => [slug, count, toPercent(count)])

    const providerSlugFrequency = Object.entries(stats.byProviderSlug)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([slug, count]) => [slug, count, toPercent(count)])

    const providerTagSlugFrequency = Object.entries(stats.byProviderTagSlug)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([slug, count]) => [slug, count, toPercent(count)])

    const crawlStats = Object.values(stats.byCrawl)

    const dailyStats = Object.values(stats.byDay)
    const [earliestDay] = days
    const latestDay = days.at(-1)

    const result = {
      total: stats.total,
      crawlCount: crawlIds.length,
      dayCount: days.length,

      entityDistribution: Object.fromEntries(
        Object.entries(stats.byEntity).map(([entity, count]) => [
          entity,
          [count, toPercent(count)] as [number, string],
        ]),
      ),
      changeKindDistribution: Object.fromEntries(
        Object.entries(stats.byChangeKind).map(([kind, count]) => [
          kind,
          [count, toPercent(count)] as [number, string],
        ]),
      ),

      topPaths: topPaths,
      entityChangeDistribution: entityChangeDistribution,
      modelSlugFrequency: modelSlugFrequency,
      providerSlugFrequency: providerSlugFrequency,
      providerTagSlugFrequency: providerTagSlugFrequency,

      changesPerCrawl: {
        min: Math.min(...crawlStats),
        max: Math.max(...crawlStats),
        avg: crawlStats.reduce((a, b) => a + b, 0) / crawlStats.length,
        median: getMedian(crawlStats),
      },

      changesPerDay: {
        min: Math.min(...dailyStats),
        max: Math.max(...dailyStats),
        avg: dailyStats.reduce((a, b) => a + b, 0) / dailyStats.length,
        median: getMedian(dailyStats),
      },

      dateRange: {
        earliest: earliestDay,
        latest: latestDay,
      },
    }
    return result
  },
})
