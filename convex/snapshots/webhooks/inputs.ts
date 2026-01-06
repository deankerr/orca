import { asyncMap } from 'convex-helpers'
import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import { internalQuery, type QueryCtx } from '../../_generated/server'
import { db } from '../../db'
import schema from '../../schema'
import { transformChanges } from '../../transforms/changes'

type TransformedChange = ReturnType<typeof transformChanges>[number]

// Non-provider changes (filtered subset we actually work with)
type ModelOrEndpointChange = Extract<TransformedChange, { entity_type: 'model' | 'endpoint' }>

// Enriched change with supporting data loaded
export type EnrichedChange = {
  raw: ModelOrEndpointChange
  model: Awaited<ReturnType<typeof db.or.views.models.getWithDescription>>
  endpoint: Doc<'or_views_endpoints'> | null
}

export const getEnabledSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('webhook_subscriptions')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .collect()
  },
})

async function enrichChange(ctx: QueryCtx, change: ModelOrEndpointChange): Promise<EnrichedChange> {
  const model = await db.or.views.models.getWithDescription(ctx, change.model_slug)

  const endpoint =
    change.entity_type === 'endpoint'
      ? await db.or.views.endpoints.getByUuid(ctx, change.endpoint_uuid)
      : null

  return { raw: change, model, endpoint }
}

function isModelOrEndpointChange(c: TransformedChange): c is ModelOrEndpointChange {
  return c.entity_type === 'model' || c.entity_type === 'endpoint'
}

async function changesByCrawlIdHandler(
  ctx: QueryCtx,
  args: { crawl_id: string },
): Promise<EnrichedChange[]> {
  const changes = await ctx.db
    .query('or_views_changes')
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
    .collect()
    .then(transformChanges)
    .then((c) => c.filter(isModelOrEndpointChange))

  return await asyncMap(changes, (c) => enrichChange(ctx, c))
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
