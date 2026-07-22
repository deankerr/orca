import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query } from './_generated/server'
import { createEndpointProjection } from './catalog/endpoints/projection'
import {
  reconstructPricingHistory,
  takeRecentCompleteCrawls,
} from './endpointPricingHistory/reconstruct'

const MAX_HISTORY_CHANGE_DOCUMENTS = 20_000

function isEndpointChange(
  change: Doc<'or_views_changes'>,
): change is Extract<Doc<'or_views_changes'>, { entity_type: 'endpoint' }> {
  return change.entity_type === 'endpoint'
}

export const get = query({
  args: {
    modelSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const endpointQuery = ctx.db
      .query('or_views_endpoints')
      .withIndex('by_model_slug', (q) => q.eq('model.slug', args.modelSlug))

    const modelQuery = ctx.db
      .query('or_views_models')
      .withIndex('by_slug', (q) => q.eq('slug', args.modelSlug))

    const changeQuery = ctx.db
      .query('or_views_changes')
      .withIndex('by_entity_type__model_slug__crawl_id', (q) =>
        q.eq('entity_type', 'endpoint').eq('model_slug', args.modelSlug),
      )
      .order('desc')

    const [endpoints, model, changes, earliestArchive, latestArchive] = await Promise.all([
      endpointQuery.collect(),
      modelQuery.first(),
      changeQuery.take(MAX_HISTORY_CHANGE_DOCUMENTS + 1),
      ctx.db.query('snapshot_crawl_archives').withIndex('by_crawl_id').order('asc').first(),
      ctx.db.query('snapshot_crawl_archives').withIndex('by_crawl_id').order('desc').first(),
    ])

    const asOf = Number(latestArchive?.crawl_id ?? 0)
    const availableSince = Number(earliestArchive?.crawl_id ?? asOf)
    const modelHistoryStart = Math.max(availableSince, model?.or_added_at ?? availableSince)
    const changeHistory = takeRecentCompleteCrawls(
      changes.filter(isEndpointChange),
      MAX_HISTORY_CHANGE_DOCUMENTS,
    )
    const retainedHistoryStart = Math.max(
      modelHistoryStart,
      changeHistory.oldestExactTimestamp ?? modelHistoryStart,
    )
    const since = Math.min(asOf, retainedHistoryStart)

    return {
      asOf,
      availableSince,
      since,
      truncated: changeHistory.truncated,
      series: reconstructPricingHistory({
        // History uses the public pricing vocabulary just like the model page.
        // The stored endpoint document still has raw names such as cache_read.
        endpoints: endpoints.map(createEndpointProjection),
        changes: changeHistory.changes,
        since,
        asOf,
      }),
    }
  },
})
