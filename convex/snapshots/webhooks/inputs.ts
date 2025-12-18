import { asyncMap } from 'convex-helpers'
import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'

import { internalQuery, QueryCtx } from '../../_generated/server'
import { db } from '../../db'
import schema from '../../schema'
import { transformChanges } from '../../transforms/changes'

// * Queries

export const getEnabledSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('webhook_subscriptions')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .collect()
  },
})

export type WebhookChange = Awaited<Promise<ReturnType<typeof changesByCrawlIdHandler>>>[number]

async function changesByCrawlIdHandler(ctx: QueryCtx, args: { crawl_id: string }) {
  const changes = await ctx.db
    .query('or_views_changes')
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
    .collect()
    .then(transformChanges)
    .then((c) => c.filter((c) => c.entity_type !== 'provider'))

  return await asyncMap(changes, async (c) => {
    // * add model data
    const model = await db.or.views.models.getWithDescription(ctx, c.model_slug)

    if (c.entity_type === 'model') {
      // * ensure update paths
      if (c.change_kind === 'update') {
        return {
          ...c,
          model,
          path: c.path ?? 'unknown',
          path_level_1: c.path_level_1 ?? 'unknown',
        }
      }

      return {
        ...c,
        model,
      }
    }

    if (c.entity_type === 'endpoint') {
      const endpoint = await db.or.views.endpoints.getByUuid(ctx, c.endpoint_uuid)

      if (c.change_kind === 'update') {
        return {
          ...c,
          model,
          endpoint,
          path: c.path ?? 'unknown',
          path_level_1: c.path_level_1 ?? 'unknown',
        }
      }

      return {
        ...c,
        model,
        endpoint,
      }
    }

    return c
  })
}

export const changesByCrawlId = internalQuery({
  args: { crawl_id: v.string() },
  handler: async (ctx, args) => await changesByCrawlIdHandler(ctx, args),
})

export const getRecentCrawlIds = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const docs = await stream(ctx.db, schema)
      .query('or_views_changes')
      .withIndex('by_crawl_id')
      .order('desc')
      .distinct(['crawl_id'])
      .take(args.limit)

    return docs.map((doc) => doc.crawl_id)
  },
})
