import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { loadScanArtifact } from '../../scan/artifact'
import { V3_PROVIDERS_VIEW_TABLE } from '../entities.table'
import { createScanProjection } from './create'

/** Restore dataPolicy metadata previously omitted from provider projections. */
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const artifactId = await ctx.runQuery(internal.v3.ingest.currentArtifactId, {})
    const artifact = await loadScanArtifact(ctx, artifactId)
    const projection = createScanProjection(artifact)

    for (const provider of projection.providers.values()) {
      await ctx.runMutation(internal.v3.projections.restoreProviderPolicy.apply, {
        providerId: provider.provider_id,
        policy: Object.fromEntries(
          Object.entries(provider.metadata).filter(([key]) => key.startsWith('dataPolicy.')),
        ),
      })
    }

    return projection.providers.size
  },
})

export const apply = internalMutation({
  args: {
    providerId: v.string(),
    policy: v.record(
      v.string(),
      v.union(v.string(), v.null(), v.boolean(), v.number(), v.array(v.string())),
    ),
  },
  handler: async (ctx, { providerId, policy }) => {
    const row = await ctx.db
      .query(V3_PROVIDERS_VIEW_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', providerId))
      .unique()

    if (row !== null) {
      await ctx.db.patch(row._id, { metadata: { ...row.metadata, ...policy } })
    }
  },
})
