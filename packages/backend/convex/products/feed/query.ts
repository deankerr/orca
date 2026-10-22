import { paginationOptsValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import { query } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { interpret } from '../shared/alerts/interpret'
import { selectDefault } from '../shared/alerts/prepare'
import type { AlertSource } from '../shared/alerts/read'
import { readPage } from '../shared/alerts/read'
import { renderPage, feedPage } from './render'
import type { FeedEvent } from './render'

/** Curated event history, newest observation first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    await preparePage(ctx, await readPage(ctx, { kind: 'all' }, args.paginationOpts)),
  returns: feedPage,
})

/** Curated changes to exactly one model, provider, or endpoint. */
export const byEntity = query({
  args: {
    entity_id: v.string(),
    entity_kind: v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    await preparePage(
      ctx,
      await readPage(
        ctx,
        { entity_id: args.entity_id, entity_kind: args.entity_kind, kind: 'entity' },
        args.paginationOpts,
      ),
    ),
  returns: feedPage,
})

/** Curated model activity, including its endpoints. */
export const byModel = query({
  args: { model_id: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    await preparePage(
      ctx,
      await readPage(ctx, { kind: 'model', model_id: args.model_id }, args.paginationOpts),
    ),
  returns: feedPage,
})

/** Curated provider activity, including its endpoints. */
export const byProvider = query({
  args: { paginationOpts: paginationOptsValidator, provider_id: v.string() },
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    await preparePage(
      ctx,
      await readPage(ctx, { kind: 'provider', provider_id: args.provider_id }, args.paginationOpts),
    ),
  returns: feedPage,
})

/** Preserve source pagination even when preparation removes every event in a page. */
async function preparePage(
  ctx: QueryCtx,
  result: PaginationResult<AlertSource>,
): Promise<PaginationResult<FeedEvent>> {
  const alerts = await Promise.all(
    result.page.map(async (row) => selectDefault(await interpret(ctx, row))),
  )
  return renderPage({ ...result, page: alerts.filter((alert) => alert !== null) })
}
