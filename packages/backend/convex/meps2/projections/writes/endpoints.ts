import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../../../_generated/server'
import { endpointsTable } from '../../tables/endpoints'
import { tableHasRows, unlistResult, upsertResult } from './helpers'

/**
 * Whether the endpoints view has any rows. Empty means rewrite `after` as upserts.
 */
export const hasRows = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await tableHasRows(ctx, 'meps2_endpoints'),
})

/**
 * Insert or replace endpoint view rows. Clears `unlisted_at` on restore.
 */
export const upsert = internalMutation({
  args: { upserts: v.array(endpointsTable.validator) },
  returns: upsertResult,
  handler: async (ctx, args) => {
    let upserted = 0

    for (const endpoint of args.upserts) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint.endpoint_id))
        .unique()

      // replace omits unlisted_at, which clears it on relist
      await (existing === null
        ? ctx.db.insert('meps2_endpoints', endpoint)
        : ctx.db.replace(existing._id, endpoint))
      upserted += 1
    }

    return { upserted }
  },
})

/**
 * Stamp `unlisted_at` on endpoints missing from `after`. Already-unlisted rows
 * are not restamped. Missing rows are skipped.
 */
export const unlist = internalMutation({
  args: {
    endpoint_ids: v.array(v.string()),
    scan_at: v.string(),
  },
  returns: unlistResult,
  handler: async (ctx, args) => {
    let unlisted = 0

    for (const endpoint_id of args.endpoint_ids) {
      const existing = await ctx.db
        .query('meps2_endpoints')
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', endpoint_id))
        .unique()
      if (existing === null || existing.unlisted_at !== undefined) {
        continue
      }

      await ctx.db.patch(existing._id, {
        unlisted_at: args.scan_at,
        scan_at: args.scan_at,
      })
      unlisted += 1
    }

    return { unlisted }
  },
})
