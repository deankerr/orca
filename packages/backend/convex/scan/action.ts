import { internalAction } from '../_generated/server'
import { createScanArtifact, storeScanArtifact } from './artifact'
import { scan } from './scan'

/** Fetch and store one complete scan artifact. */
export const run = internalAction({
  handler: async (ctx) => {
    const entries = await scan()
    const artifact = createScanArtifact(entries)

    await storeScanArtifact(ctx, artifact)
  },
})
