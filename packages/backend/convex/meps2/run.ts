import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { storeArtifact } from './artifacts/storage'
import { loadBaseline } from './catalog/baseline'
import { scanCatalog } from './catalog/scan'
import { projectCatalog } from './projections/catalog'

export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const workflow = 'catalog'
    const started_at = Date.now()

    const run_id = await ctx.runMutation(internal.meps2.runs.runStart, {
      workflow,
      timestamp: started_at,
    })

    try {
      const catalog = await scanCatalog()

      const stored = await storeArtifact(ctx, {
        workflow,
        timestamp: started_at,
        format: catalog.bundle_format,
        data: catalog.file,
        run_id,
      })
      console.log('[meps2:scan] artifact stored', {
        artifact_id: stored.artifact_id,
        content_sha256: stored.content_sha256,
        size: stored.size,
      })

      const before = await loadBaseline(ctx, workflow)
      const projected = await projectCatalog(ctx, {
        before,
        after: catalog,
        timestamp: started_at,
      })

      await ctx.runMutation(internal.meps2.runs.runComplete, {
        run_id,
        completed_at: Date.now(),
        stats: {
          models: catalog.models.size,
          endpoints: catalog.endpoints.size,
          providers: catalog.providers.size,
          model_upserts: projected.models.upserted,
          model_deletes: projected.models.deleted,
          endpoint_upserts: projected.endpoints.upserted,
          endpoint_unlists: projected.endpoints.unlisted,
          provider_upserts: projected.providers.upserted,
          provider_deletes: projected.providers.deleted,
          pricing_samples: projected.endpoints.pricing_samples,
          stats_samples: projected.endpoints.stats_samples,
        },
      })
    } catch (error) {
      await ctx.runMutation(internal.meps2.runs.runFail, {
        run_id,
        completed_at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    return null
  },
})
