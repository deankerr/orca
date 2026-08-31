import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import { SCAN_PATH } from '../../scan/scanArtifact'
import { startDrain } from './start'

/**
 * Register already-stored historical identities, then start latest-edge drain
 * when `nextAfter(latest)` is non-null (including an empty window).
 *
 * Earliest-edge drain against a non-empty window is not started.
 *
 * @throws {ConvexError} If a `scan_at` is interior to the ingested window.
 */
export const backfill = internalMutation({
  args: {
    scans: v.array(
      v.object({
        scan_at: v.string(),
        artifact_id: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    for (const scan of args.scans) {
      await ctx.runMutation(internal.meps2.ingest.mutations.register, {
        path: SCAN_PATH,
        artifact_id: scan.artifact_id,
        scan_at: scan.scan_at,
      })
    }

    await startDrain(ctx, SCAN_PATH)
    return null
  },
})
