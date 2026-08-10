import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import { vCurrentEndpointProduct } from './table'

const TABLE = 'or_current_endpoints' as const

/**
 * Upsert product endpoint cards by `uuid`.
 *
 * Replaces the whole product document when present (clears `unavailable_at` until unavailability
 * marking is designed). Always stamps `updated_at`.
 *
 * Called from the engine delivery HTTP path; not used by the web app yet.
 */
export const upsert = internalMutation({
  args: {
    endpoints: v.array(vCurrentEndpointProduct),
  },
  returns: v.object({
    insert: v.number(),
    update: v.number(),
  }),
  handler: async (ctx, args) => {
    const counters = { insert: 0, update: 0 }
    const now = Date.now()

    for (const endpoint of args.endpoints) {
      const existing = await ctx.db
        .query(TABLE)
        .withIndex('by_uuid', (q) => q.eq('uuid', endpoint.uuid))
        .unique()

      // * Omit unavailable_at on write — reappearing endpoints are treated as available again.
      // * Proper unavailable delivery is TBD (see table.ts).
      const doc = { ...endpoint, updated_at: now }

      if (existing) {
        await ctx.db.replace(existing._id, doc)
        counters.update += 1
      } else {
        await ctx.db.insert(TABLE, doc)
        counters.insert += 1
      }
    }

    return counters
  },
})
