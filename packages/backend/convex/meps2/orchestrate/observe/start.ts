import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import { SCAN_PATH } from '../../scan/scanArtifact'
import { workflow } from '../manager'
import { LOCK_KEY } from './workflow'

/**
 * Claim the observe lock, assign `scan_at`, and start the workflow.
 *
 * Cron and dashboard entry. Returns before ingest completes.
 *
 * @throws {ConvexError} If the observe lock is already held.
 */
export const start = internalMutation({
  args: {},
  returns: v.object({ scan_at: v.string() }),
  handler: async (ctx): Promise<{ scan_at: string }> => {
    await ctx.runMutation(internal.meps2.lock.claim, { key: LOCK_KEY })

    const scan_at = new Date().toISOString()
    await workflow.start(
      ctx,
      internal.meps2.orchestrate.observe.workflow.observe,
      { scan_at },
      {
        onComplete: internal.meps2.orchestrate.observe.onComplete.onComplete,
        context: { path: SCAN_PATH },
      },
    )
    return { scan_at }
  },
})
