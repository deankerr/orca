import { paginationOptsValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import { query } from '../../_generated/server'
import type { EventRow } from '../../events/table'
import { prepare as prepareAlert } from '../shared/prepare'
import { readPage } from '../shared/read'
import { render, feedPage } from './render'
import type { FeedEvent } from './render'

/** Curated event history, newest observation first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(await readPage(ctx, { kind: 'all' }, args.paginationOpts)),
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
    renderPage(
      await readPage(
        ctx,
        { kind: 'entity', entity_kind: args.entity_kind, entity_id: args.entity_id },
        args.paginationOpts,
      ),
    ),
})

/** Curated model activity, including its endpoints. */
export const byModel = query({
  args: { model_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(
      await readPage(ctx, { kind: 'model', model_id: args.model_id }, args.paginationOpts),
    ),
})

/** Curated provider activity, including its endpoints. */
export const byProvider = query({
  args: { provider_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: feedPage,
  handler: async (ctx, args): Promise<PaginationResult<FeedEvent>> =>
    renderPage(
      await readPage(ctx, { kind: 'provider', provider_id: args.provider_id }, args.paginationOpts),
    ),
})

/** Preserve source pagination even when preparation removes every event in a page. */
export function renderPage(result: PaginationResult<EventRow>): PaginationResult<FeedEvent> {
  return {
    ...result,
    page: result.page.flatMap((row) => {
      const alert = prepareAlert(row)

      return alert === null ? [] : [render(alert)]
    }),
  }
}
