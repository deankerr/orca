import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { REGISTRATIONS_TABLE } from './ingestion/table'

/** Preview bootstrap: seed two days of history, or resume an existing timeline. */
const init = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const latest = await ctx.db
      .query(REGISTRATIONS_TABLE)
      .withIndex('by_scan_at')
      .order('desc')
      .first()
    await ctx.scheduler.runAfter(
      0,
      internal.ingestion.register.next,
      latest === null ? { start_at: new Date(Date.now() - 2 * 86_400_000).toISOString() } : {},
    )
    return null
  },
})

export default init
