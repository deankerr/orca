import { docValidator, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from '../../_generated/server'
import { eventsTable, V4_EVENTS_TABLE } from './table'

const page = paginationResultValidator(docValidator(V4_EVENTS_TABLE, eventsTable))

/** Event history, newest observation first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: page,
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_EVENTS_TABLE)
      .withIndex('by_scan_at')
      .order('desc')
      .paginate(args.paginationOpts),
})

/** Changes to exactly one model, provider, or endpoint, newest observation first. */
export const byEntity = query({
  args: {
    entity_kind: v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint')),
    entity_id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: page,
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_EVENTS_TABLE)
      .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
        q.eq('entity_kind', args.entity_kind).eq('entity_id', args.entity_id),
      )
      .order('desc')
      .paginate(args.paginationOpts),
})

/** Model and related endpoint events, newest observation first. */
export const byModel = query({
  args: { model_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: page,
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_EVENTS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) => q.eq('context.model.model_id', args.model_id))
      .order('desc')
      .paginate(args.paginationOpts),
})

/** Provider and related endpoint events, newest observation first. */
export const byProvider = query({
  args: { provider_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: page,
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_EVENTS_TABLE)
      .withIndex('by_provider_id_and_scan_at', (q) =>
        q.eq('context.provider.provider_id', args.provider_id),
      )
      .order('desc')
      .paginate(args.paginationOpts),
})
