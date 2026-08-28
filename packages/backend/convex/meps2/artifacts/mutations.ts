import { internalMutation } from '../../_generated/server'
import { artifactsTable } from '../tables/artifacts'

export const insertArtifact = internalMutation({
  args: { artifact: artifactsTable.validator },
  handler: async (ctx, args) =>
    // insert-only by design: artifact rows are permanent and never replaced.
    // a collision on artifact_id means a workflow reused a timestamp and should fail loudly
    await ctx.db.insert('meps2_artifacts', args.artifact),
})

export const dev_wipeArtifacts = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const doc of ctx.db.query('meps2_artifacts')) {
      await ctx.storage.delete(doc.storage_id)
      await ctx.db.delete('meps2_artifacts', doc._id)
    }
  },
})
