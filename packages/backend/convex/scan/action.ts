import { internalAction } from '../_generated/server'
import { store } from '../objects'
import { createScanArtifact } from './artifact'
import { scan } from './scan'
import { SCAN_ARTIFACT_OBJECT_PATH } from './schema'

export const run = internalAction({
  handler: async (ctx) => {
    const entries = await scan()
    const artifact = createScanArtifact(entries)

    await store(ctx, {
      name: artifact.id,
      path: SCAN_ARTIFACT_OBJECT_PATH,
      text: artifact.text,
    })
  },
})
