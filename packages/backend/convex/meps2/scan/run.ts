import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { loadArtifact, storeArtifact } from '../artifacts/storage'
import type { Catalog } from './catalog'
import { catalogFile, deserializeCatalog, emptyCatalog, serializeCatalog } from './catalog'
import { projectCatalog } from './project'
import { scanCatalog } from './scan'
import { appendCatalogStats } from './stats'

export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // workflow identity and run timestamp are fixed before any work begins
    const workflow = 'catalog'
    const started_at = Date.now()

    // creates the run record; throws if another run is already active
    const run_id = await ctx.runMutation(internal.meps2.scan.runs.runStart, {
      workflow,
      timestamp: started_at,
    })

    try {
      const catalog = await scanCatalog()
      const file = catalogFile.parse(serializeCatalog(catalog))
      const after = deserializeCatalog(file)

      // store the transformed payload before any derivation so it survives downstream failures
      const stored = await storeArtifact(ctx, {
        workflow,
        timestamp: started_at,
        format: catalog.bundle_format,
        data: file,
        run_id,
      })
      console.log('[meps2:scan] artifact stored', {
        artifact_id: stored.artifact_id,
        content_sha256: stored.content_sha256,
        size: stored.size,
      })

      const previous = await ctx.runQuery(
        internal.meps2.artifacts.queries.getLatestSucceededArtifact,
        { workflow },
      )
      const hasProjection = await ctx.runQuery(internal.meps2.scan.queries.hasProjectedModels, {})

      // empty tables or no prior successful apply: rewrite every entity from this file
      let before: Catalog = emptyCatalog()
      if (previous !== null && hasProjection) {
        const envelope = await loadArtifact(ctx, previous.storage_id)
        before = deserializeCatalog(catalogFile.parse(envelope.data))
      }

      const projected = await projectCatalog(ctx, { before, after, updated_at: started_at })
      const stats = await appendCatalogStats(ctx, { catalog: after, timestamp: started_at })

      let endpoints = 0
      for (const item of after.data.values()) {
        endpoints += item.endpoints?.size ?? 0
      }

      await ctx.runMutation(internal.meps2.scan.runs.runComplete, {
        run_id,
        completed_at: Date.now(),
        stats: {
          models: after.data.size,
          endpoints,
          providers: after.providers.size,
          model_upserts: projected.models.upserted,
          model_deletes: projected.models.deleted,
          endpoint_upserts: projected.endpoints.upserted,
          endpoint_deletes: projected.endpoints.deleted,
          provider_upserts: projected.providers.upserted,
          provider_deletes: projected.providers.deleted,
          pricing_samples: projected.pricing.inserted,
          stats_samples: stats.inserted,
        },
      })
    } catch (error) {
      await ctx.runMutation(internal.meps2.scan.runs.runFail, {
        run_id,
        completed_at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    return null
  },
})
