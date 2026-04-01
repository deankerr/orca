// Monitor feed — crawl_id discovery stays reactive and lightweight.
//
// The feed query returns only crawl_ids for the current visible window.
// The batch query returns enriched changes for a single crawl (cached forever).

import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'

import { query, type QueryCtx } from './_generated/server'
import { getByCrawlId, type EntityChange } from './db/or/views/changes'
import schema from './schema'
import { baseProviderSlug } from './shared/utils'

export type CrawlBatch = {
  crawl_id: string
  changes: EntityChange[]
}

function buildUnfilteredCrawlIdStream(ctx: QueryCtx) {
  return stream(ctx.db, schema)
    .query('or_views_changes')
    .withIndex('by_crawl_id')
    .order('desc')
    .distinct(['crawl_id'])
}

function buildModelCrawlIdStream(ctx: QueryCtx, modelSlug: string) {
  return stream(ctx.db, schema)
    .query('or_views_changes')
    .withIndex('by_model_slug__crawl_id', (q) => q.eq('model_slug', modelSlug))
    .order('desc')
    .distinct(['crawl_id'])
}

function buildProviderCrawlIdStream(ctx: QueryCtx, providerSlug: string) {
  return stream(ctx.db, schema)
    .query('or_views_changes')
    .withIndex('by_provider_slug__crawl_id', (q) => q.eq('provider_slug', providerSlug))
    .order('desc')
    .distinct(['crawl_id'])
}

function buildExactEndpointCrawlIdStream(ctx: QueryCtx, modelSlug: string, providerSlug: string) {
  return stream(ctx.db, schema)
    .query('or_views_changes')
    .withIndex('by_model_slug__provider_slug__crawl_id', (q) =>
      q.eq('model_slug', modelSlug).eq('provider_slug', providerSlug),
    )
    .order('desc')
    .distinct(['crawl_id'])
}

function buildFilteredCrawlIdStream(ctx: QueryCtx, modelSlug?: string, providerSlug?: string) {
  if (modelSlug && providerSlug) {
    return buildExactEndpointCrawlIdStream(ctx, modelSlug, providerSlug)
  }

  if (modelSlug) {
    return buildModelCrawlIdStream(ctx, modelSlug)
  }

  if (providerSlug) {
    return buildProviderCrawlIdStream(ctx, providerSlug)
  }

  return buildUnfilteredCrawlIdStream(ctx)
}

export const feedIds = query({
  args: {
    modelSlug: v.optional(v.string()),
    providerSlug: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.floor(args.limit))
    const modelSlug = args.modelSlug
    const providerSlug = args.providerSlug ? baseProviderSlug(args.providerSlug) : undefined

    const crawlIdStream = buildFilteredCrawlIdStream(ctx, modelSlug, providerSlug)

    const docs = await crawlIdStream.take(limit + 1)
    return {
      crawlIds: docs.slice(0, limit).map((doc) => doc.crawl_id),
      hasMore: docs.length > limit,
    }
  },
})

export const batch = query({
  args: { crawl_id: v.string() },
  handler: async (ctx, { crawl_id }): Promise<CrawlBatch> => {
    const changes = await getByCrawlId(ctx, crawl_id)
    return { crawl_id, changes }
  },
})
