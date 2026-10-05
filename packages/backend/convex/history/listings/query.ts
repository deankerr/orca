import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '#generated/server'

import { cappedCutoff, emptyPage, pageArgs, pageResult } from '../pagination'
import { ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'

/** Discover historical members, including endpoints that have since moved to another model. */
export const endpoints = query({
  args: { model_id: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { model_id }) => {
    const rows = await ctx.db
      .query(ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) => q.eq('model_id', model_id))
      .collect()
    return [...new Set(rows.map((row) => row.endpoint_id))].toSorted()
  },
})

/** An endpoint's small, complete context history, reactive to late observations and model moves. */
export const forEndpoint = query({
  args: { endpoint_id: v.string() },
  returns: v.array(endpointListingsTable.validator),
  handler: async (ctx, { endpoint_id }) => {
    const rows = await ctx.db
      .query(ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) => q.eq('endpoint_id', endpoint_id))
      .collect()
    return rows.map(withoutSystemFields)
  },
})

/** Page an endpoint's full context, including moves between models and provider tags. */
export const list = query({
  args: { endpoint_id: v.string(), ...pageArgs },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Page a model's context rows for historical endpoint discovery; deduplicate UUIDs across pages. */
export const byModel = query({
  args: { model_id: v.string(), ...pageArgs },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) =>
        q.eq('model_id', args.model_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})
