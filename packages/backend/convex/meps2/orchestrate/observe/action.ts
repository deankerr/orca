import { v } from 'convex/values'

import { internalAction } from '../../../_generated/server'
import { store } from '../../artifacts/storage'
import type { ScanRef } from '../../ingest/shared'
import { vScanRef } from '../../ingest/shared'
import { scan } from '../../scan/scan'

/**
 * Fetch OpenRouter, serialize one scan artifact, and store it.
 *
 * Returns the identity only. Uncompressed JSONL is not a step result.
 */
export const observe = internalAction({
  args: { scan_at: v.string() },
  returns: vScanRef,
  handler: async (ctx, args): Promise<ScanRef> => {
    const artifact = await scan({ scan_at: args.scan_at })
    await store(ctx, {
      path: artifact.path,
      artifact_id: artifact.artifact_id,
      bytes: artifact.bytes,
    })
    return {
      path: artifact.path,
      artifact_id: artifact.artifact_id,
      scan_at: artifact.scan_at,
    }
  },
})
