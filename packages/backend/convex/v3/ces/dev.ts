import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'

/** Development reset discards the experiment while preserving scans. Stop both runners first;
 * ordinary processing never reopens a completed job.
 */
export const clear = internalMutation({
  args: {
    table: v.union(v.literal('ces_events'), v.literal('ces_jobs'), v.literal('ces_batches')),
  },
  returns: v.boolean(),
  handler: async (ctx, { table }) => {
    // Convex permits one paginated query per transaction. The action advances between tables.
    const { page, isDone } = await ctx.db
      .query(table)
      .paginate({ cursor: null, numItems: 20, maximumBytesRead: 2_000_000 })
    for (const row of page) {
      await ctx.db.delete(table, row._id)
    }
    return isDone
  },
})

export const reset = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    for (const table of ['ces_events', 'ces_jobs', 'ces_batches'] as const) {
      while (!(await ctx.runMutation(internal.v3.ces.dev.clear, { table }))) {
        /* bounded reset transactions */
      }
    }
    return null
  },
})
