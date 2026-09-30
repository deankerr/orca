import { paginationOptsValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { query } from '../../_generated/server'
import { renderPage, feedPage } from './render'
import type { FeedEvent } from './render'

/** Curated event history, newest observation first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(await ctx.runQuery(internal.v4.events.query.list, args)),
})

/** Curated changes to exactly one model, provider, or endpoint. */
export const byEntity = query({
  args: {
    entity_kind: v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint')),
    entity_id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(await ctx.runQuery(internal.v4.events.query.byEntity, args)),
})

/** Curated model activity, including its endpoints. */
export const byModel = query({
  args: { model_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(await ctx.runQuery(internal.v4.events.query.byModel, args)),
})

/** Curated provider activity, including its endpoints. */
export const byProvider = query({
  args: { provider_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(await ctx.runQuery(internal.v4.events.query.byProvider, args)),
})
