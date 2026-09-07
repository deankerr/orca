import { v } from 'convex/values'

import { env, internalAction } from '../_generated/server'
import { createScanArtifact, storeScanArtifact } from './artifact'
import { scan } from './scan'

/** Fetch and store one complete scan artifact. */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_SCAN_ENABLED !== 'true') {
      return null
    }

    const entries = await scan()
    const artifact = createScanArtifact(entries)

    await storeScanArtifact(ctx, artifact)
    return null
  },
})
