import { v } from 'convex/values'

import { internalAction } from '../_generated/server'
import { store } from './artifacts/storage'
import { scan } from './scan'

/**
 * Fetch OpenRouter, serialize one scan artifact, and store it.
 *
 * Apply is a later step of the same run.
 */
export const run = internalAction({
  args: {},
  returns: v.object({
    path: v.string(),
    artifact_id: v.string(),
    content_sha256: v.string(),
    size: v.object({
      raw: v.number(),
      blob: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const { path, artifact_id, bytes } = await scan()
    return await store(ctx, { path, artifact_id, bytes })
  },
})
