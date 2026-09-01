import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import {
  getScanAt,
  getScanByArtifact,
  getWindow,
  nextAfterRow,
  nextBeforeRow,
  vScanRef,
} from './shared'

/**
 * Admit a stored identity onto the timeline.
 *
 * Same pair is idempotent. Interior to the ingested interval is refused.
 *
 * @throws {ConvexError} If `scan_at` or the artifact pair is bound to a different
 *   identity, or `scan_at` is strictly inside the ingested window.
 */
export const register = internalMutation({
  args: vScanRef.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const byAt = await getScanAt(ctx, args.path, args.scan_at)

    if (byAt !== null) {
      if (byAt.artifact_id === args.artifact_id) {
        return null
      }

      throw new ConvexError({
        message: 'scan_at already registered',
        path: args.path,
        scan_at: args.scan_at,
        artifact_id: args.artifact_id,
        existing_artifact_id: byAt.artifact_id,
      })
    }

    const byArtifact = await getScanByArtifact(ctx, args.path, args.artifact_id)

    if (byArtifact !== null) {
      if (byArtifact.scan_at === args.scan_at) {
        return null
      }

      throw new ConvexError({
        message: 'artifact already registered',
        path: args.path,
        artifact_id: args.artifact_id,
        scan_at: args.scan_at,
        existing_scan_at: byArtifact.scan_at,
      })
    }

    const window = await getWindow(ctx, args.path)

    if (
      window !== null &&
      window.earliest_scan_at < args.scan_at &&
      args.scan_at < window.latest_scan_at
    ) {
      throw new ConvexError({
        message: 'scan_at is interior to the ingested window',
        path: args.path,
        scan_at: args.scan_at,
        earliest_scan_at: window.earliest_scan_at,
        latest_scan_at: window.latest_scan_at,
      })
    }

    await ctx.db.insert('meps2_scans', args)
    return null
  },
})

/**
 * Advance the ingested window by exactly one neighbor.
 *
 * First ingest must be the oldest registered row. Same edge `scan_at` is a no-op.
 *
 * @throws {ConvexError} If the scan is not registered, not the first ingest, or
 *   not an edge neighbor.
 */
export const markIngested = internalMutation({
  args: {
    path: v.string(),
    scan_at: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const registered = await getScanAt(ctx, args.path, args.scan_at)

    if (registered === null) {
      throw new ConvexError({
        message: 'scan is not registered',
        path: args.path,
        scan_at: args.scan_at,
      })
    }

    const window = await getWindow(ctx, args.path)

    if (window === null) {
      const oldest = await nextAfterRow(ctx, args.path, null)

      if (oldest === null || oldest.scan_at !== args.scan_at) {
        throw new ConvexError({
          message: 'first ingest must be the oldest registered scan',
          path: args.path,
          scan_at: args.scan_at,
          oldest_scan_at: oldest?.scan_at ?? null,
        })
      }

      await ctx.db.insert('meps2_ingest_window', {
        path: args.path,
        earliest_scan_at: args.scan_at,
        latest_scan_at: args.scan_at,
      })
      return null
    }

    if (args.scan_at === window.latest_scan_at || args.scan_at === window.earliest_scan_at) {
      return null
    }

    const after = await nextAfterRow(ctx, args.path, window.latest_scan_at)

    if (after !== null && after.scan_at === args.scan_at) {
      await ctx.db.patch(window._id, { latest_scan_at: args.scan_at })
      return null
    }

    const before = await nextBeforeRow(ctx, args.path, window.earliest_scan_at)

    if (before !== null && before.scan_at === args.scan_at) {
      await ctx.db.patch(window._id, { earliest_scan_at: args.scan_at })
      return null
    }

    throw new ConvexError({
      message: 'scan_at is not an ingest edge neighbor',
      path: args.path,
      scan_at: args.scan_at,
      earliest_scan_at: window.earliest_scan_at,
      latest_scan_at: window.latest_scan_at,
    })
  },
})
