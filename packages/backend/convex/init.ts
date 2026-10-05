import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { clock } from './clock'

/** Preview bootstrap: seed two days of history, or resume an existing timeline. */
const init = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const scanAt = await clock(ctx)
    await ctx.scheduler.runAfter(
      0,
      internal.ingest.run,
      scanAt === null ? { start_at: new Date(Date.now() - 2 * 86_400_000).toISOString() } : {},
    )
    return null
  },
})

export default init
