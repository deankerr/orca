import { asyncMap } from 'convex-helpers'
import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'

import { internalQuery, type QueryCtx } from '../_generated/server'
import { db } from '../db'
import { ModelDocWithDescription } from '../db/or/views/models'
import schema from '../schema'
import { TransformedChange } from '../transforms/changes'
import { OrcaEndpoint } from '../transforms/endpoint'

// Non-provider changes (filtered subset we actually work with)
type ModelOrEndpointChange = Extract<TransformedChange, { entity_type: 'model' | 'endpoint' }>

// Enriched change with supporting data loaded
export type EnrichedChange = ModelOrEndpointChange & {
  model: ModelDocWithDescription | null
  endpoint: OrcaEndpoint | null
}

// Entity-specific variants for embed functions
export type ModelChange = Extract<EnrichedChange, { entity_type: 'model' }>
export type EndpointChange = Extract<EnrichedChange, { entity_type: 'endpoint' }>

async function changesByCrawlIdHandler(
  ctx: QueryCtx,
  args: { crawl_id: string },
): Promise<EnrichedChange[]> {
  const changes = await db.or.views.changes
    .listTransformedByCrawlId(ctx, args.crawl_id)
    .then((changes) => changes.filter((c) => c.entity_type !== 'provider'))

  return await asyncMap(changes, async (c) => {
    const model = await db.or.views.models.getWithDescription(ctx, c.model_slug)
    const endpoint =
      c.entity_type === 'endpoint'
        ? await db.or.views.endpoints.getTransformedByUuid(ctx, c.endpoint_uuid)
        : null

    return { ...c, model, endpoint }
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
