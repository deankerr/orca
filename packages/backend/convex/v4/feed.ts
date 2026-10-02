import { paginationOptsValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { query } from '../_generated/server'
import { forFeed } from './alerts/pipelines'
import { render, feedPage } from './alerts/renderers/json'
import type { FeedEvent } from './alerts/renderers/json'
import type { EventRow } from './events/query'

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

/** Preserve source pagination even when preparation removes every event in a page. */
export function renderPage(result: PaginationResult<EventRow>): PaginationResult<FeedEvent> {
  return {
    ...result,
    page: result.page.flatMap((row) => {
      const alert = forFeed(row)

      return alert === null ? [] : [render(alert)]
    }),
  }
}
