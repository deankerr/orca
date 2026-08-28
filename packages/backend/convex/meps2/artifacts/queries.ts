import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'

export const getLatestArtifact = internalQuery({
  args: { workflow: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query('meps2_artifacts')
      .withIndex('by_workflow_created_at', (q) => q.eq('workflow', args.workflow))
      .order('desc')
      .first(),
})

// baseline for projection: last file whose run finished apply, not merely the last stored blob
export const getLatestSucceededArtifact = internalQuery({
  args: { workflow: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      artifact_id: v.string(),
      storage_id: v.id('_storage'),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query('meps2_runs')
      .withIndex('by_workflow_status', (q) =>
        q.eq('workflow', args.workflow).eq('status', 'succeeded'),
      )
      .order('desc')
      .first()

    if (run === null) {
      return null
    }

    const artifact = await ctx.db
      .query('meps2_artifacts')
      .withIndex('by_run_id', (q) => q.eq('run_id', run._id))
      .first()

    if (artifact === null) {
      return null
    }

    return {
      artifact_id: artifact.artifact_id,
      storage_id: artifact.storage_id,
      created_at: artifact.created_at,
    }
  },
})
