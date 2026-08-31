import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from '../../_generated/server'
import { artifactsTable } from '../tables/artifacts'

const artifactRecord = artifactsTable.validator

/**
 * Locator row for this identity. Not part of the store/load interface.
 *
 * @returns The row, or `null` if nothing was stored under this pair.
 */
export const get = internalQuery({
  args: {
    path: v.string(),
    artifact_id: v.string(),
  },
  returns: v.union(v.null(), artifactRecord),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query('meps2_artifacts')
      .withIndex('by_path_artifact_id', (q) =>
        q.eq('path', args.path).eq('artifact_id', args.artifact_id),
      )
      .unique()

    if (doc === null) {
      return null
    }

    const { path, artifact_id, storage_id, content_sha256, size } = doc
    return { path, artifact_id, storage_id, content_sha256, size }
  },
})

/**
 * Insert a locator row. Insert-only.
 *
 * @throws {ConvexError} If `(path, artifact_id)` is already present.
 */
export const insert = internalMutation({
  args: { artifact: artifactRecord },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('meps2_artifacts')
      .withIndex('by_path_artifact_id', (q) =>
        q.eq('path', args.artifact.path).eq('artifact_id', args.artifact.artifact_id),
      )
      .unique()

    if (existing !== null) {
      throw new ConvexError({
        message: 'artifact already exists',
        path: args.artifact.path,
        artifact_id: args.artifact.artifact_id,
      })
    }

    await ctx.db.insert('meps2_artifacts', args.artifact)
    return null
  },
})
