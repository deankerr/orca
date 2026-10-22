import { v } from 'convex/values'

import { internalMutation } from '#generated/server'

import { kickoff } from './ingestion/sync'
import { INGESTION_TARGET_TABLE } from './ingestion/tables'

/** Preview initialization lookback before the captured instant. */
const PREVIEW_LOOKBACK_MS = 24 * 60 * 60 * 1000

/** Preview bootstrap: target the last day once, then sync; a repeated run only resumes. */
const init = internalMutation({
  args: {},
  handler: async (ctx) => {
    if ((await ctx.db.query(INGESTION_TARGET_TABLE).unique()) === null) {
      const now = Date.now()
      await ctx.db.insert(INGESTION_TARGET_TABLE, {
        end_at: new Date(now).toISOString(),
        start_at: new Date(now - PREVIEW_LOOKBACK_MS).toISOString(),
      })
    }

    await kickoff(ctx)
    return null
  },
  returns: v.null(),
})

export default init
